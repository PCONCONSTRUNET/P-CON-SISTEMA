/**
 * Conversão de .p12 / .pfx para PEM no browser
 * Usa pkijs + Web Crypto API — suporta PBES2/AES-256 (formato moderno da EFI Bank)
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

function passwordToUint8Array(password: string): Uint8Array {
  // PKCS12 passwords são codificados como UTF-16 Big Endian com null terminator
  const buf = new ArrayBuffer((password.length + 1) * 2);
  const view = new DataView(buf);
  for (let i = 0; i < password.length; i++) {
    view.setUint16(i * 2, password.charCodeAt(i), false); // big endian
  }
  view.setUint16(password.length * 2, 0, false); // null terminator
  return new Uint8Array(buf);
}

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
  const cryptoEngine = new pkijs.CryptoEngine({
    name: 'WebCrypto',
    crypto: crypto, // window.crypto / globalThis.crypto
  });
  pkijs.setEngine('WebCrypto', cryptoEngine);

  // Parseia o arquivo PKCS12 (DER binário)
  const asn1 = asn1js.fromBER(p12Buffer);
  if (asn1.offset === -1) {
    throw new Error('Arquivo .p12 inválido ou corrompido. Não foi possível parsear a estrutura ASN.1.');
  }

  const pfx = new pkijs.PFX({ schema: asn1.result });

  // Decodifica o conteúdo interno com a senha fornecida
  const passwordUint8 = passwordToUint8Array(password);
  await pfx.parseInternalValues({
    password: passwordUint8,
    checkIntegrity: true,
  });

  const certPems: string[] = [];
  let keyPem = '';

  // Percorre os SafeContents para extrair certificados e chaves
  const safeContents = pfx.parsedValue?.authenticatedSafe?.parsedValue;
  if (!safeContents || !Array.isArray(safeContents)) {
    throw new Error('Estrutura PKCS12 não contém SafeContents válidos.');
  }

  for (const sc of safeContents) {
    const safeBags = sc.parsedValue?.safeBags;
    if (!safeBags) continue;

    for (const bag of safeBags) {
      const bagId = bag.bagId;

      // CertBag — 1.2.840.113549.1.12.10.1.3
      if (bagId === '1.2.840.113549.1.12.10.1.3') {
        try {
          const cert = bag.bagValue?.parsedValue?.certValue;
          if (cert) {
            const der = cert.toSchema(true).toBER(false);
            certPems.push(toPemBlock(der, 'CERTIFICATE'));
          }
        } catch (_) {
          console.warn('[p12ToPem] Falha ao extrair certificado:', _);
        }
      }

      // KeyBag (não-encriptada) — 1.2.840.113549.1.12.10.1.1
      if (bagId === '1.2.840.113549.1.12.10.1.1' && !keyPem) {
        try {
          const key = bag.bagValue;
          if (key) {
            const der = key.toSchema().toBER(false);
            keyPem = toPemBlock(der, 'PRIVATE KEY');
          }
        } catch (_) {
          console.warn('[p12ToPem] Falha ao extrair chave não-encriptada:', _);
        }
      }

      // PKCS8ShroudedKeyBag (encriptada) — 1.2.840.113549.1.12.10.1.2
      if (bagId === '1.2.840.113549.1.12.10.1.2' && !keyPem) {
        try {
          const shroudedBag = bag.bagValue;
          if (shroudedBag) {
            // parsedValue já deve estar desencriptado após parseInternalValues
            const parsed = shroudedBag.parsedValue;
            if (parsed) {
              const der = parsed.toSchema().toBER(false);
              keyPem = toPemBlock(der, 'PRIVATE KEY');
            } else {
              // Tenta extrair diretamente do shroudedBag
              const der = shroudedBag.toSchema().toBER(false);
              keyPem = toPemBlock(der, 'ENCRYPTED PRIVATE KEY');
            }
          }
        } catch (_) {
          console.warn('[p12ToPem] Falha ao extrair chave encriptada:', _);
        }
      }
    }
  }

  if (certPems.length === 0 && !keyPem) {
    throw new Error(
      'Não foi possível extrair nenhum certificado ou chave privada do arquivo .p12. ' +
      'Verifique se o arquivo é válido e se a senha está correta (geralmente vazia para certificados EFI Bank).'
    );
  }

  const pem = [...certPems, keyPem].filter(Boolean).join('\n');

  return {
    pem,
    certCount: certPems.length,
    hasPrivateKey: !!keyPem,
  };
}
