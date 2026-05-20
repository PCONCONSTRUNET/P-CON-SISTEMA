import forge from 'node-forge';

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

  try {
    const { p12Base64, password = '' } = req.body;

    if (!p12Base64) {
      res.status(400).json({ error: 'Dados do arquivo .p12 (base64) ausentes.' });
      return;
    }

    let pem = '';
    try {
      // Decodifica base64 para Buffer e depois para string binária (exigido pelo node-forge)
      const p12Buffer = Buffer.from(p12Base64, 'base64');
      const p12Der = p12Buffer.toString('binary');
      
      const p12Asn1 = forge.asn1.fromDer(p12Der);
      const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

      // 1. Extrai Certificados (certBag)
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const certs = certBags[forge.pki.oids.certBag] || [];
      for (let i = 0; i < certs.length; i++) {
        if (certs[i].cert) {
          pem += forge.pki.certificateToPem(certs[i].cert) + '\n';
        }
      }

      // 2. Extrai Chaves Privadas Criptografadas (pkcs8ShroudedKeyBag)
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
      const keys = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] || [];
      for (let i = 0; i < keys.length; i++) {
        if (keys[i].key) {
          pem += forge.pki.privateKeyToPem(keys[i].key) + '\n';
        }
      }

      // 3. Extrai Chaves Privadas Não Criptografadas (keyBag) - caso existam
      const plainKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
      const plainKeys = plainKeyBags[forge.pki.oids.keyBag] || [];
      for (let i = 0; i < plainKeys.length; i++) {
        if (plainKeys[i].key) {
          pem += forge.pki.privateKeyToPem(plainKeys[i].key) + '\n';
        }
      }

      pem = pem.trim();

      if (!pem || !pem.includes('BEGIN CERTIFICATE') || !pem.includes('BEGIN PRIVATE KEY')) {
        res.status(400).json({ 
          error: 'Não foi possível extrair a chave privada e o certificado do arquivo .p12. Verifique se o arquivo está correto.' 
        });
        return;
      }

    } catch (extractErr) {
      console.error('[convert-p12] Falha na extração com node-forge:', extractErr);
      res.status(400).json({
        error: `Falha ao descriptografar o arquivo .p12. Verifique se há uma senha ou se o arquivo é válido. Detalhes: ${extractErr.message}`
      });
      return;
    }

    res.status(200).json({
      success: true,
      pem,
      message: 'Certificado .p12 convertido para PEM com sucesso!'
    });
  } catch (err) {
    console.error('[convert-p12] Erro interno:', err);
    res.status(500).json({ error: `Erro interno no servidor: ${err.message}` });
  }
}
