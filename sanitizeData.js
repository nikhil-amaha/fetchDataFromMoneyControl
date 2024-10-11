// sanitizeData.js

const fs = require("fs");
const path = require("path");

// Read the input JSON file
const inputFile = "./sanitizeInput.json"; // Ensure this path points to your input JSON file

let inputData;
try {
  const inputRawData = fs.readFileSync(inputFile);
  inputData = JSON.parse(inputRawData);
} catch (err) {
  console.error("Error reading input file:", err);
  process.exit(1);
}

// Get file locations from input data
const sanitizeData = inputData.sanitizeData[0];
const fileLocation1 = sanitizeData.fileLocation1; // e.g., './all_mf_scheme.json'
const fileLocation2 = sanitizeData.fileLocation2; // e.g., './outputs/all_mutual_funds.json'

// Read file 1 (all_mf_scheme.json)
let file1Data;
try {
  const file1RawData = fs.readFileSync(fileLocation1);
  file1Data = JSON.parse(file1RawData);
} catch (err) {
  console.error("Error reading file 1:", err);
  process.exit(1);
}

// Read file 2 (all_mutual_funds.json)
let file2Data;
try {
  const file2RawData = fs.readFileSync(fileLocation2);
  file2Data = JSON.parse(file2RawData);
} catch (err) {
  console.error("Error reading file 2:", err);
  process.exit(1);
}

// Create sanitized_data folder if it doesn't exist
const outputFolder = "./sanitized_data";
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder);
}

// Function to normalize scheme names
function normalizeSchemeName(name) {
  const stopWords = ["option", "plan", "regular", "direct"];

  return name
    ?.toLowerCase()
    ?.replace(/-/g, " ") // Replace hyphens with spaces
    ?.replace(/[^\w\s]/g, "") // Remove punctuation
    ?.split(/\s+/) // Split into words
    ?.filter((word) => !stopWords.includes(word)) // Remove stop words
    ?.join(" ") // Rejoin into string
    ?.trim();
}

// Function to compute similarity between two scheme names
function computeSimilarity(name1, name2) {
  const words1 = name1.split(" ");
  const words2 = name2.split(" ");
  const fundHouse1 = words1[0];
  const fundHouse2 = words2[0];

  // If fund house names don't match, similarity is zero
  if (fundHouse1 !== fundHouse2) {
    return 0;
  }

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  const similarity = intersection.size / union.size;
  return similarity;
}

// Build a map of normalized scheme names to items in file 1
const schemeNameMap = new Map();
for (const item of file1Data) {
  const normalizedSchemeName = normalizeSchemeName(item.schemeName);
  schemeNameMap.set(normalizedSchemeName, item);
}

// Prepare an array of normalized scheme names from file 1 for similarity comparison
const normalizedSchemeNames = [];
for (const item of file1Data) {
  const normalizedSchemeName = normalizeSchemeName(item.schemeName);
  normalizedSchemeNames.push({
    normalizedName: normalizedSchemeName,
    originalItem: item,
  });
}

// Arrays to hold confirmed, unconfirmed, not found data
const confirmedData = [];
const unconfirmedData = [];
const notFoundData = [];
const allData = [];

// Process each item in file 2
for (const item2 of file2Data) {
  const schemeNameText = item2.scheme_name;
  const normalizedSchemeNameText = normalizeSchemeName(schemeNameText);

  let matched = false; // Flag to check if the item was matched

  // Check for an exact match
  if (schemeNameMap.has(normalizedSchemeNameText)) {
    // Exact match found
    const matchedItem = schemeNameMap.get(normalizedSchemeNameText);
    item2.schemeCode = matchedItem.schemeCode;
    item2.schemeName = matchedItem.schemeName;
    confirmedData.push(item2);
    matched = true;
  } else {
    // No exact match; compute similarities
    let maxSimilarity = 0;
    let possibleMatches = [];

    for (const item1 of normalizedSchemeNames) {
      const similarity = computeSimilarity(
        normalizedSchemeNameText,
        item1.normalizedName
      );
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        possibleMatches = [item1];
      } else if (similarity === maxSimilarity) {
        possibleMatches.push(item1);
      }
    }

    if (maxSimilarity > 0) {
      // Possible matches found
      const schemeCodes = [
        ...new Set(possibleMatches.map((m) => m.originalItem.schemeCode)),
      ];
      item2.possibleSchemeCode = schemeCodes;
      item2.possibleSchemeName = possibleMatches.map(
        (m) => m.originalItem.schemeName
      );
      unconfirmedData.push(item2);
      matched = true;
    } else {
      // No matches found
      notFoundData.push(item2);
    }
  }

  // Include in allData only if matched (confirmed or unconfirmed)
  if (matched) {
    allData.push(item2);
  }
}

// Write the output files
fs.writeFileSync(
  path.join(outputFolder, "confirmed_data.json"),
  JSON.stringify(confirmedData, null, 2)
);

fs.writeFileSync(
  path.join(outputFolder, "unconfirmed_data.json"),
  JSON.stringify(unconfirmedData, null, 2)
);

fs.writeFileSync(
  path.join(outputFolder, "not_found.json"),
  JSON.stringify(notFoundData, null, 2)
);

fs.writeFileSync(
  path.join(outputFolder, "all_data.json"),
  JSON.stringify(allData, null, 2)
);

// Log the counts of confirmed, unconfirmed, and not found matches
console.log(
  "Data sanitization complete. Output files are in the sanitized_data folder."
);
console.log(`Total schemes processed: ${file2Data.length}`);
console.log(`Confirmed matches: ${confirmedData.length}`);
console.log(`Unconfirmed matches: ${unconfirmedData.length}`);
console.log(`Not found matches: ${notFoundData.length}`);
