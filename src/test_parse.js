const rawContent = '[{"id": "cake123"}]';
try {
    const parsed = JSON.parse(rawContent);
    if (parsed && Array.isArray(parsed.results)) {
        console.log("Found results");
    } else {
        console.log("No parsed.results!");
    }
} catch (e) {
    console.log("Caught error");
}
