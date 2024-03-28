const callSummary = async (textToSummary) => {
    const summaryRes = await fetch('/get_summary', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            input_text: textToSummary
        })
    });

    if (summaryRes.status === 200)
    {
        const jsonResult = await summaryRes.json();
        console.log("Raw json result:", jsonResult.response);
        let summaryText = jsonResult.response.response;
        return summaryText.replace(/<\/?text>/g, '');
    } else {
        console.error(`Get summary error: ${summaryRes.status}`);
        return "";
    }
}


