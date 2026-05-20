const crypto = require('crypto');

module.exports = async (req, res) => {
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

  try {
    const { p12Base64, password = '' } = req.body;

    if (!p12Base64) {
      res.status(400).json({ error: 'Dados do arquivo .p12 (base64) ausentes.' });
      return;
    }

    // Decodifica base64 para Buffer
    const p12Buffer = Buffer.from(p12Base64, 'base64');

    // Verifica suporte ao método nativo crypto.pkcs12.extract
    if (!crypto.pkcs12 || !crypto.pkcs12.extract) {
      res.status(500).json({ error: 'A extração PKCS12 nativa não é suportada nesta versão do Node.js.' });
      return;
    }

    let extracted;
    try {
      // EFI Bank por padrão gera certificados de produção sem senha (senha em branco)
      extracted = crypto.pkcs12.extract(p12Buffer, password);
    } catch (extractErr) {
      console.error('[convert-p12] Falha na extração:', extractErr);
      res.status(400).json({
        error: `Falha ao descriptografar o arquivo .p12. Verifique se há uma senha ou se o arquivo é válido. Detalhes: ${extractErr.message}`
      });
      return;
    }

    const { key, cert } = extracted;
    if (!key || !cert) {
      res.status(400).json({ error: 'Não foi possível extrair a chave privada e o certificado do arquivo .p12.' });
      return;
    }

    // Une o certificado e a chave privada em uma string PEM única
    const pem = `${cert}\n${key}`;

    res.status(200).json({
      success: true,
      pem,
      message: 'Certificado .p12 convertido para PEM com sucesso!'
    });
  } catch (err) {
    console.error('[convert-p12] Erro interno:', err);
    res.status(500).json({ error: `Erro interno no servidor: ${err.message}` });
  }
};
