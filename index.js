const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const urlModule = require("url");

(async () => {
  // Read the input JSON file
  const inputData = JSON.parse(fs.readFileSync("input.json", "utf8"));

  // Ensure the outputs directory exists
  const outputsDir = path.join(__dirname, "outputs");
  if (!fs.existsSync(outputsDir)) {
    fs.mkdirSync(outputsDir);
  }

  // Initialize an array to hold all data
  let allData = [];

  for (const item of inputData.fetch_data_from) {
    const { name, link } = item;
    try {
      console.log(`Processing "${name}" from URL: ${link}`);
      // Fetch the webpage content
      const response = await axios.get(link);
      const html = response.data;

      // Load the HTML into Cheerio
      const $ = cheerio.load(html);

      // Find all <table> elements
      const tables = $("table");
      let tableDataArray = [];

      for (let i = 0; i < tables.length; i++) {
        let tableData = [];
        const table = tables[i];
        const rows = $(table).find("tr");

        // Extract table headers if available
        let headers = [];
        const headerRow = $(table).find("tr").first();
        headerRow.find("th").each((i, th) => {
          let headerText = $(th).text().trim();
          headerText = replaceHeaderText(headerText); // Replace specific headers
          headers.push(toSnakeCase(headerText));
        });

        // Process each row
        for (let j = 1; j < rows.length; j++) {
          const row = rows[j];
          const cells = $(row).find("td");

          if (cells.length > 0) {
            let rowData = {};

            // Flag to check if the row should be skipped
            let skipRow = false;

            for (let k = 0; k < cells.length; k++) {
              const cell = cells[k];

              // Check if cell contains an <a> tag
              const linkElement = $(cell).find("a");
              if (linkElement.length > 0) {
                const href = linkElement.attr("href");

                // Skip if 'pubads' is in the href
                if (href && href.includes("pubads")) {
                  console.log("Ad detected, skipping row.");
                  skipRow = true;
                  break; // Break out of cell loop, move to next row
                }

                const linkText = linkElement.text().trim();

                // Modify the link according to the rules
                const modifiedLink = modifyLink(href);

                let nestedData = null;
                if (modifiedLink) {
                  console.log(
                    `Fetching data for ${linkText} from ${modifiedLink}`
                  );
                  // Fetch the modified link and extract table data
                  try {
                    nestedData = await fetchNestedTableData(modifiedLink);
                  } catch (error) {
                    console.error(
                      `Error fetching nested data for ${linkText}: ${error.message}`
                    );
                  }
                }

                // Save the nested data under 'portfolio_holdings' key
                rowData["portfolio_holdings"] = nestedData;

                // Store the link and text (use linkText)
                let cellText = cleanText(linkText); // Use linkText instead of cell text
                let key =
                  headers.length > 0 && headers[k]
                    ? headers[k]
                    : `column${k + 1}`;

                if (key === "scheme_name") {
                  // For 'scheme_name', only store the text without the link
                  rowData[key] = cellText;
                } else {
                  // For other keys, include both text and link
                  rowData[key] = { text: cellText, link: href };
                }
              } else {
                // No <a> tag, just store the text
                let cellText = cleanText($(cell).text());
                let key =
                  headers.length > 0 && headers[k]
                    ? headers[k]
                    : `column${k + 1}`;
                rowData[key] = cellText;
              }
            }

            // Skip row if 'portfolio_holdings' is null
            if (!skipRow && rowData["portfolio_holdings"] !== null) {
              tableData.push(rowData);
              allData.push(rowData); // Add to allData
            }
          }
        }

        if (tableData.length > 0) {
          // Only add non-empty tableData arrays
          tableDataArray.push(tableData);
        }
      }

      // Save the output data to a JSON file in the outputs directory
      const safeName = name.replace(/[^\w\s]/gi, "").replace(/\s+/g, "_"); // Sanitize filename
      const outputFilePath = path.join(outputsDir, `${safeName}.json`);
      fs.writeFileSync(
        outputFilePath,
        JSON.stringify(tableDataArray, null, 2),
        "utf8"
      );
      console.log(`Data for "${name}" saved to ${outputFilePath}`);
    } catch (error) {
      console.error(`Error processing "${name}" from ${link}:`, error.message);
    }
  }

  // Write allData to all_mutual_funds.json in the outputs directory
  const allDataFilePath = path.join(outputsDir, `all_mutual_funds.json`);
  fs.writeFileSync(allDataFilePath, JSON.stringify(allData, null, 2), "utf8");
  console.log(`All mutual funds data saved to ${allDataFilePath}`);

  console.log(
    "Data extraction complete. Check the outputs folder for results."
  );
})();

// Function to modify the link according to the rules
function modifyLink(originalLink) {
  try {
    const urlObj = urlModule.parse(originalLink);
    // For example, if the path starts with /mutual-funds/nav/
    if (urlObj.pathname.startsWith("/mutual-funds/nav/")) {
      // Remove 'nav/' from the path and insert 'portfolio-holdings/'
      let newPath = urlObj.pathname.replace("/nav/", "/");
      const pathParts = newPath.split("/").filter((part) => part !== "");
      // Extract the fund code (last segment)
      const code = pathParts.pop();
      // Insert 'portfolio-holdings' before the code
      pathParts.push("portfolio-holdings", code);
      newPath = "/" + pathParts.join("/");

      // Build the modified URL
      const modifiedUrl = urlModule.format({
        protocol: urlObj.protocol,
        host: urlObj.host,
        pathname: newPath,
      });
      return modifiedUrl;
    } else {
      // If the link doesn't match the pattern, return the original link
      return originalLink;
    }
  } catch (error) {
    console.error(`Error modifying link ${originalLink}: ${error.message}`);
    return null;
  }
}

// Function to fetch and extract table data from the modified link
async function fetchNestedTableData(url) {
  try {
    const response = await axios.get(url);
    const html = response.data;

    // Load the HTML into Cheerio
    const $ = cheerio.load(html);

    // Find the table with id 'equityCompleteHoldingTable'
    const table = $("#equityCompleteHoldingTable");

    if (table.length === 0) {
      console.error('Table with id "equityCompleteHoldingTable" not found.');
      return null;
    }

    let tableData = [];

    const rows = table.find("tr");

    // Extract table headers
    let headers = [];
    const headerRow = table.find("tr").first();
    headerRow.find("th").each((i, th) => {
      let headerText = $(th).text().trim();
      headerText = replaceHeaderText(headerText); // Replace specific headers
      headers.push(toSnakeCase(headerText));
    });

    // Process each row
    for (let i = 1; i < rows.length; i++) {
      // Start from 1 to skip header row
      const row = rows[i];
      const cells = $(row).find("td");
      if (cells.length > 0) {
        let rowData = {};

        for (let j = 0; j < cells.length; j++) {
          const cell = cells[j];
          let cellText = cleanText($(cell).text());

          let key =
            headers.length > 0 && headers[j] ? headers[j] : `column${j + 1}`;
          rowData[key] = cellText;
        }

        tableData.push(rowData);
      }
    }

    return tableData;
  } catch (error) {
    console.error(
      `Error fetching nested table data from ${url}: ${error.message}`
    );
    return null;
  }
}

// Function to clean the text extracted from cells
function cleanText(text) {
  // Remove '#' symbols, newlines, leading dashes, and excessive whitespace
  return text
    .replace(/#/g, "")
    .replace(/\n/g, "")
    .replace(/^\s*[-–—]\s*/, "") // Removes leading dashes and surrounding whitespace
    .replace(/\s+/g, " ") // Replace multiple spaces with a single space
    .trim();
}

// Function to convert a string to snake_case and lowercase
function toSnakeCase(str) {
  return str
    .replace(/%/g, "percentage") // Replace % with 'percentage'
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .replace(/[^\w_]/g, "") // Remove any non-word characters except underscores
    .toLowerCase();
}

// Function to replace specific header texts
function replaceHeaderText(headerText) {
  // Map of headers to replace
  const headerReplacements = {
    "value(mn)": "value_mn",
    "1w": "week_one",
    "1m": "month_one",
    "3m": "month_three",
    "6m": "month_six",
    "1y": "year_one",
    "2y": "year_two",
    "3y": "year_three",
    "5y": "year_five",
    "10y": "year_ten",
    // Add more replacements here if needed
  };

  // Convert header text to lowercase and trim for case-insensitive matching
  const normalizedHeader = headerText.toLowerCase().trim();

  // Check if the header matches any keys in the replacements map
  if (headerReplacements.hasOwnProperty(normalizedHeader)) {
    return headerReplacements[normalizedHeader];
  } else {
    return headerText;
  }
}
