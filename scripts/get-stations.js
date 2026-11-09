// Node 18+ built-in global fetch

async function main() {
  const loginRes = await fetch('https://artemia-pisonet-backend.onrender.com/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'artemia_admin', password: 'AdminPisonet2026!', type: 'staff' })
  });
  const loginData = await loginRes.json();
  if (!loginData.success) {
    console.error('Login failed:', loginData);
    return;
  }
  const token = loginData.token;
  console.log('Admin logged in successfully!');

  const stationsRes = await fetch('https://artemia-pisonet-backend.onrender.com/api/v1/pcs', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await stationsRes.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
