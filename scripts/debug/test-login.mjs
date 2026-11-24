// Usando fetch nativo do Node 20

const SUPABASE_URL = "https://bevahgtmcdicyhjnrylk.supabase.co";
const SUPABASE_KEY = "sb_publishable_ziYHN3SayMmRYxusCm7qQQ_-rqQG7gM";
const AUTH_URL = `${SUPABASE_URL}/functions/v1/client-auth-new?action=login`;

async function testLogin() {
  console.log("--- Iniciando teste de login ---");
  console.log("URL:", AUTH_URL);
  
  try {
    const res = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'apikey': SUPABASE_KEY 
      },
      body: JSON.stringify({
        email: "lucaspereirabn10@gmail.com",
        password: "test" // senha propositalmente errada para testar 401
      }),
    });

    console.log("Status:", res.status);
    console.log("Status Text:", res.statusText);
    
    const text = await res.text();
    console.log("Resposta bruta:", text);

    try {
      const json = JSON.parse(text);
      console.log("JSON:", json);
    } catch (e) {
      console.log("A resposta não é um JSON válido.");
    }

  } catch (err) {
    console.error("ERRO DE REDE:", err);
  }
}

testLogin();
