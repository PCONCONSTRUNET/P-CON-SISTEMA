/**
 * Conversão de .p12 / .pfx para PEM no browser
 * Usa pkijs v3 + Web Crypto API — suporta PBES2/AES-256 (formato moderno da EFI Bank)
 */
import * as pkijs from 'pkijs';
import * as asn1js from 'asn1js';

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function toPemBlock(der: ArrayBuffer, label: string): string {
  const b64 = arrayBufferToBase64(der);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function stringToArrayBuffer(str: string): ArrayBuffer {
  // PKCS12 passwords são UTF-16 Big Endian com null terminator
  if (str === '') return new ArrayBuffer(0);
  const buf = new ArrayBuffer((str.length + 1) * 2);
  const view = new DataView(buf);
  for (let i = 0; i < str.length; i++) {
    view.setUint16(i * 2, str.charCodeAt(i), false);
  }
  view.setUint16(str.length * 2, 0, false);
  return buf;
}

// ────────────────────────────────────────────────────────────────
// OIDs dos SafeBag PKCS12
// ────────────────────────────────────────────────────────────────
const OID_KEYBAG = '1.2.840.113549.1.12.10.1.1';
const OID_PKCS8_SHROUDED = '1.2.840.113549.1.12.10.1.2';
const OID_CERTBAG = '1.2.840.113549.1.12.10.1.3';

// ────────────────────────────────────────────────────────────────
// Conversão principal
// ────────────────────────────────────────────────────────────────

export interface P12ConversionResult {
  pem: string;
  certCount: number;
  hasPrivateKey: boolean;
}

export async function p12ToPem(
  p12Buffer: ArrayBuffer,
  password: string = ''
): Promise<P12ConversionResult> {
  // Configura o engine de crypto do pkijs para usar o Web Crypto do browser
  pkijs.setEngine('WebCrypto', new pkijs.CryptoEngine({
    name: 'WebCrypto',
    crypto: globalThis.crypto,
  }));

  // Parseia o arquivo PKCS12 (DER binário)
  const asn1 = asn1js.fromBER(p12Buffer);
  if (asn1.offset === -1) {
    throw new Error('Arquivo .p12 inválido ou corrompido. Não foi possível parsear a estrutura ASN.1.');
  }

  const pfx = new pkijs.PFX({ schema: asn1.result });

  // Converte a senha para o formato PKCS12 (UTF-16 BE)
  const passwordBuffer = stringToArrayBuffer(password);

  // Decodifica o conteúdo interno (descriptografa SafeContents encriptados)
  await pfx.parseInternalValues({
    password: passwordBuffer,
    checkIntegrity: true,
  });

  const certPems: string[] = [];
  let keyPem = '';

  // ── Itera sobre os SafeContents (pkijs v3: authenticatedSafe é iterável como array) ──
  const authenticatedSafe = pfx.parsedValue?.authenticatedSafe as any;

  if (!authenticatedSafe) {
    throw new Error('Arquivo .p12 não contém AuthenticatedSafe. O arquivo pode estar corrompido.');
  }

  // authenticatedSafe pode ser um array direto de ContentInfo ou ter uma prop .value
  const contentInfoList: any[] = Array.isArray(authenticatedSafe)
    ? authenticatedSafe
    : (authenticatedSafe.value ?? authenticatedSafe.parsedValue ?? []);

  if (!Array.isArray(contentInfoList) || contentInfoList.length === 0) {
    console.error('[p12ToPem] authenticatedSafe structure:', JSON.stringify(Object.keys(authenticatedSafe)));
    throw new Error(
      'Estrutura PKCS12 inválida: não foi possível localizar os ContentInfo. ' +
      'Verifique se o arquivo .p12 é um certificado EFI Bank válido.'
    );
  }

  for (const contentInfo of contentInfoList) {
    // parsedValue de cada ContentInfo é um SafeContents
    const safeContents = contentInfo?.parsedValue as any;
    const safeBags: any[] = safeContents?.safeBags ?? [];

    for (const bag of safeBags) {
      const bagId = bag.bagId as string;

      // ── CertBag ──
      if (bagId === OID_CERTBAG) {
        try {
          const certValue = bag.bagValue?.parsedValue?.certValue;
          if (certValue) {
            const der = certValue.toSchema(true).toBER(false);
            certPems.push(toPemBlock(der, 'CERTIFICATE'));
          }
        } catch (e) {
          console.warn('[p12ToPem] Falha ao extrair certificado:', e);
        }
      }

      // ── KeyBag (chave não-encriptada, PKCS#8 PrivateKeyInfo) ──
      if (bagId === OID_KEYBAG && !keyPem) {
        try {
          const keyValue = bag.bagValue;
          if (keyValue) {
            const der = keyValue.toSchema().toBER(false);
            keyPem = toPemBlock(der, 'PRIVATE KEY');
          }
        } catch (e) {
          console.warn('[p12ToPem] Falha ao extrair KeyBag:', e);
        }
      }

      // ── PKCS8ShroudedKeyBag (chave encriptada → descriptografada após parseInternalValues) ──
      if (bagId === OID_PKCS8_SHROUDED && !keyPem) {
        try {
          // parsedValue contém o PrivateKeyInfo já descriptografado
          const parsed = bag.bagValue?.parsedValue;
          if (parsed) {
            const der = parsed.toSchema().toBER(false);
            keyPem = toPemBlock(der, 'PRIVATE KEY');
          } else if (bag.bagValue) {
            // Fallback: usa o EncryptedPrivateKeyInfo diretamente
            const der = bag.bagValue.toSchema().toBER(false);
            keyPem = toPemBlock(der, 'ENCRYPTED PRIVATE KEY');
          }
        } catch (e) {
          console.warn('[p12ToPem] Falha ao extrair PKCS8ShroudedKeyBag:', e);
        }
      }
    }
  }

  if (certPems.length === 0 && !keyPem) {
    throw new Error(
      'Nenhum certificado ou chave privada encontrado no arquivo .p12. ' +
      'Verifique se o arquivo é um certificado EFI Bank válido.'
    );
  }

  const pem = [...certPems, keyPem].filter(Boolean).join('\n');

  return {
    pem,
    certCount: certPems.length,
    hasPrivateKey: !!keyPem,
  };
}
