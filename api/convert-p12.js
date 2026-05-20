import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import crypto from 'crypto';

export default async function handler(req, res) {
  // Habilitar CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido. Use POST.' });
    return;
  }

  // Arquivos temporários
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const tmpDir = tmpdir();
  const p12Path = join(tmpDir, `efi_cert_${uniqueId}.p12`);
  const pemPath = join(tmpDir, `efi_cert_${uniqueId}.pem`);

  const cleanup = () => {
    try { if (existsSync(p12Path)) unlinkSync(p12Path); } catch (_) {}
    try { if (existsSync(pemPath)) unlinkSync(pemPath); } catch (_) {}
  };

  try {
    const { p12Base64, password = '' } = req.body;

    if (!p12Base64) {
      return res.status(400).json({ error: 'Dados do arquivo .p12 (base64) ausentes.' });
    }

    // Decodifica base64 e salva o .p12 em arquivo temporário
    const p12Buffer = Buffer.from(p12Base64, 'base64');
    writeFileSync(p12Path, p12Buffer);

    console.log(`[convert-p12] Arquivo .p12 salvo em ${p12Path} (${p12Buffer.length} bytes)`);

    // Tenta converter com OpenSSL (sem flag -legacy primeiro — para formatos modernos PBES2/AES-256)
    const passin = password ? `pass:${password}` : 'pass:';
    let conversionError = null;

    const attempts = [
      `openssl pkcs12 -in "${p12Path}" -out "${pemPath}" -nodes -passin "${passin}"`,
      `openssl pkcs12 -in "${p12Path}" -out "${pemPath}" -nodes -legacy -passin "${passin}"`,
    ];

    for (const cmd of attempts) {
      try {
        execSync(cmd, { timeout: 15000, stdio: 'pipe' });
        conversionError = null;
        console.log(`[convert-p12] Conversão bem-sucedida com: ${cmd}`);
        break;
      } catch (err) {
        conversionError = err;
        console.warn(`[convert-p12] Tentativa falhou: ${err.message}`);
      }
    }

    if (conversionError) {
      cleanup();
      return res.status(400).json({
        error: `Falha ao converter o arquivo .p12 com OpenSSL. Verifique se o arquivo é válido e se a senha está correta (normalmente vazia para certificados EFI Bank). Detalhes: ${conversionError.message}`,
      });
    }

    // Lê o PEM gerado
    const rawPem = readFileSync(pemPath, 'utf8');

    // Remove os "Bag Attributes" que o OpenSSL insere (metadados não necessários)
    // e retorna apenas os blocos PEM limpos (CERTIFICATE + PRIVATE KEY)
    const cleanedPem = rawPem
      .replace(/Bag Attributes[\s\S]*?(?=-----BEGIN)/g, '')
      .replace(/subject=[\s\S]*?(?=-----BEGIN)/g, '')
      .replace(/issuer=[\s\S]*?(?=-----BEGIN)/g, '')
      .trim();

    cleanup();

    if (!cleanedPem.includes('BEGIN CERTIFICATE') || !cleanedPem.includes('BEGIN PRIVATE KEY')) {
      return res.status(400).json({
        error:
          'O arquivo foi processado mas não contém tanto o certificado quanto a chave privada. Verifique se o arquivo .p12 está correto e não está corrompido.',
      });
    }

    console.log(`[convert-p12] PEM gerado com sucesso (${cleanedPem.length} chars)`);

    return res.status(200).json({
      success: true,
      pem: cleanedPem,
      message: 'Certificado .p12 convertido para PEM com sucesso!',
    });
  } catch (err) {
    cleanup();
    console.error('[convert-p12] Erro interno:', err);
    return res.status(500).json({ error: `Erro interno no servidor: ${err.message}` });
  }
}
