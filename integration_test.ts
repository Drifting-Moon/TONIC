import axios from 'axios';

async function runTests() {
  const API_URL = 'http://localhost:3000';

  console.log('--- TESTING PILLAR 1 & 2 (Ingestion & Deduplication) ---');
  
  // Need 1
  const text1 = "dharavi sector 4 mein bahut paani bhar gaya hai, 3 families fassi hui hain. need help fast!";
  const res1 = await axios.post(`${API_URL}/ingest`, { text: text1 });
  console.log('Ingest 1 ->', res1.data.status, 'Cluster count:', res1.data.reportCount);

  // Need 2 (Similar)
  const text2 = "heavy water logging in panvel, people stuck in cars";
  const res2 = await axios.post(`${API_URL}/ingest`, { text: text2 });
  console.log('Ingest 2 ->', res2.data.status, 'Cluster count:', res2.data.reportCount, "(Expect 1 since different location)");

  // Need 3 (Similar to 1)
  const text3 = "We need boats in dharavi, flooding is really bad near sector 4. At least 5 families trapped.";
  const res3 = await axios.post(`${API_URL}/ingest`, { text: text3 });
  console.log('Ingest 3 ->', res3.data.status, 'Cluster count:', res3.data.reportCount);

  // Need 4 (Similar to 1 -> Should trigger CRITICAL_VELOCITY)
  const text4 = "Dharavi is totally flooded near sector 4 temple. send rescue team.";
  const res4 = await axios.post(`${API_URL}/ingest`, { text: text4 });
  console.log('Ingest 4 ->', res4.data.status, 'Cluster count:', res4.data.reportCount);

  console.log('\n--- TESTING PILLAR 3 (Dispatch) ---');
  // Dispatch for the critical Dharavi cluster
  const clusterId = res4.data.id;
  try {
    const dispatchRes = await axios.post(`${API_URL}/dispatch`, { needId: clusterId });
    console.log('Dispatch Match ->', dispatchRes.data.volunteer.name);
    console.log('Message ->\n', dispatchRes.data.dispatchMessage);
  } catch(e: any) {
    console.log('Dispatch Error:', e.response?.data || e.message);
  }
}

runTests().catch(console.error);
