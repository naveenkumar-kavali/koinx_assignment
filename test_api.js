const fs = require('fs');

async function testApi() {
  const baseUrl = 'http://localhost:3000';
  console.log(`Starting API test against ${baseUrl}...`);

  try {
    // 1. Trigger Reconciliation
    console.log('\n[POST /reconcile] Triggering reconciliation...');
    const reconcileRes = await fetch(`${baseUrl}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestampToleranceSeconds: 300,
        quantityTolerancePct: 0.01,
        proximityWindowSeconds: 86400
      })
    });
    
    if (!reconcileRes.ok) {
      throw new Error(`Failed to reconcile: ${reconcileRes.status} ${await reconcileRes.text()}`);
    }
    
    const reconcileData = await reconcileRes.json();
    const runId = reconcileData.run._id;
    console.log(`Run created successfully. Run ID: ${runId}`);
    console.log('Summary statistics:', reconcileData.run.summary);

    // 2. Fetch Summary
    console.log(`\n[GET /report/${runId}/summary] Fetching summary...`);
    const summaryRes = await fetch(`${baseUrl}/report/${runId}/summary`);
    if (!summaryRes.ok) {
      throw new Error(`Failed to fetch summary: ${summaryRes.status}`);
    }
    const summaryData = await summaryRes.json();
    console.log('Summary response:', summaryData);

    // 3. Fetch Unmatched
    console.log(`\n[GET /report/${runId}/unmatched] Fetching unmatched list...`);
    const unmatchedRes = await fetch(`${baseUrl}/report/${runId}/unmatched`);
    if (!unmatchedRes.ok) {
      throw new Error(`Failed to fetch unmatched: ${unmatchedRes.status}`);
    }
    const unmatchedData = await unmatchedRes.json();
    console.log(` Unmatched list fetched. Count: ${unmatchedData.unmatchedResults.length}`);
    console.log('First unmatched result sample:', unmatchedData.unmatchedResults[0]?.reason);

    // 4. Fetch Full Report (JSON)
    console.log(`\n[GET /report/${runId}] Fetching full report (JSON)...`);
    const reportRes = await fetch(`${baseUrl}/report/${runId}`);
    if (!reportRes.ok) {
      throw new Error(`Failed to fetch report: ${reportRes.status}`);
    }
    const reportData = await reportRes.json();
    console.log(` Full report fetched. Result count: ${reportData.results.length}`);

    // 5. Fetch Full Report (CSV)
    console.log(`\n[GET /report/${runId}?format=csv] Fetching full report (CSV)...`);
    const csvRes = await fetch(`${baseUrl}/report/${runId}?format=csv`);
    if (!csvRes.ok) {
      throw new Error(`Failed to fetch CSV report: ${csvRes.status}`);
    }
    const csvText = await csvRes.text();
    console.log(' CSV report fetched. First 5 lines of CSV:');
    console.log(csvText.split('\n').slice(0, 5).join('\n'));

    console.log('\n ALL REST API TESTS PASSED SUCCESSFULLY! ');
  } catch (err) {
    console.error(' API Test failed:', err);
    process.exit(1);
  }
}

testApi();
