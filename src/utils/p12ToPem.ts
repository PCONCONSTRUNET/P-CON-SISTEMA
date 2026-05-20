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

  // Converte a senha para UTF-8 (o pkijs converte internamente para BMPString se necessário)
  const passwordBuffer = new TextEncoder().encode(password).buffer;

  // Decodifica o conteúdo de integridade externa do PFX
  await pfx.parseInternalValues({
    password: passwordBuffer,
    checkIntegrity: true,
  });

  const authenticatedSafe = pfx.parsedValue?.authenticatedSafe as any;
  if (!authenticatedSafe) {
    throw new Error('Arquivo .p12 não contém AuthenticatedSafe. O arquivo pode estar corrompido.');
  }

  // Executa o parse/decriptação dos SafeContents internos do AuthenticatedSafe
  // Precisamos passar os parâmetros com a senha para cada um dos safeContents presentes
  const safeContentsParams = Array.from(authenticatedSafe.safeContents || [], () => ({
    password: passwordBuffer
  }));

  await authenticatedSafe.parseInternalValues({
    safeContents: safeContentsParams
  });

  const decryptedSafeContents = authenticatedSafe.parsedValue?.safeContents || [];
  if (!Array.isArray(decryptedSafeContents) || decryptedSafeContents.length === 0) {
    throw new Error(
      'Estrutura PKCS12 inválida: não foi possível decifrar os SafeContents. ' +
      'Verifique se a senha do certificado está correta.'
    );
  }

  const certPems: string[] = [];
  let keyPem = '';

  for (const content of decryptedSafeContents) {
    // Cada content é um objeto { privacyMode: number, value: SafeContents }
    const safeContents = content.value as any;
    const safeBags = safeContents?.safeBags || [];

    for (const bag of safeBags) {
      const bagId = bag.bagId as string;

      // ── CertBag ──
      if (bagId === OID_CERTBAG) {
        try {
          const certValue = bag.bagValue?.parsedValue;
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

      // ── PKCS8ShroudedKeyBag (chave encriptada) ──
      if (bagId === OID_PKCS8_SHROUDED && !keyPem) {
        try {
          // Descriptografa o shrouded key bag usando a senha fornecida
          await bag.bagValue.parseInternalValues({ password: passwordBuffer });
          const parsed = bag.bagValue.parsedValue; // Agora é um PrivateKeyInfo
          if (parsed) {
            const der = parsed.toSchema().toBER(false);
            keyPem = toPemBlock(der, 'PRIVATE KEY');
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
      'Verifique se o arquivo é um certificado EFI Bank válido ou se a senha está correta.'
    );
  }

  const pem = [...certPems, keyPem].filter(Boolean).join('\n');

  return {
    pem,
    certCount: certPems.length,
    hasPrivateKey: !!keyPem,
  };
}
