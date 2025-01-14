/**
 *  Process-Validate PDF 
 *      
 *      Download, parse and optionally validate a PDF document
 *      The sister step "Validate PDF Fields/Texts" can be used after this to do different validation(s) for tracking purposes
 * 
 *  Parameters
 *      fieldsToValidate (JS) [optional] - JSON expected text/data that can be used to validate data in a PDF file
 *                          Example:  [{"Family Name" : "Solomon" }, { "Gender_List_Box": "Man" }, { "Height_Formatted_Field": "150" }, { "Favourite_Colour_List_Box": "Red" } ]
 *                                    [{  "TextBlock": "PDF Form Example" } ]
 *      pages (JS) - Limits processing to just certain pages
 *                          Example:  '1-3'       Pages 1,2,3
 *                                    '3-5'       Pages 3,4,5
 *                                    '1,2,4-6'   Pages 1,2,4,5,6
 *                                    4           Page 1-4
 *                                    <unset>     All pages
 *      pdf2json (NPM) - pdf2json NPM Package (Version: 1.3.1)
 *      clipboardy (NPM) - clipboardy NPM Package (Version  2.3.0)
 * 
 *  Output (The following test level variables will be created on successful execution of this step)
 *      pdfActualFieldValues : actual values that can be used as expected values (baseline)
 *      pdfDocumentFields    : JSON array of any fields found in the document
 *      pdfDocumentTexts     : JSON of all Text blocks with corresponding coordinates (Top, Left, Bottom, Right) 
 *      pdfDocumentTextLines : Array of lines of text grouped together based on positional y value of block(s)
 * 
 *  Disclaimer
 *      This Custom CLI Action is provided "AS IS".  It is for instructional purposes only and is not officially supported by Testim
 * 
 *  Base Step
 * 
 *      Validate Download 
 * 
 *  Installation
 *      Create a new "Validate Download" step
 *      Name it "Download-Process-Validate PDF"
 *      Create parameters
 *          fieldsToValidate (JS) 
 *          pages (JS) 
 *          pdf2json (NPM) and set its value = pdf2json @ latest 
 *          clipboardy (NPM) and set its value = clipboardy @ 2.3.0 
 *      Set the new custom action's function body to this javascript
 *      Set connection information
 *      Exit the step editor
 *      Share the step if not already done so
 *      Save the test
 *      Bob's your uncle
 */

// Used for debugging.  Enable/disable writing interim data to the console
let verbose = false;

// let fileName = "C:\\Users\\barry\\OneDrive\\Projects\\nginx-1.16.1\\html\\OoPdfFormExample.pdf";

const LINE_TEXTBLOCK_SEPARTOR_TOKEN = " ==> ";

let pdfParser;
if (typeof pdf2json !== 'undefined' && pdf2json !== null) {
    pdfParser = new pdf2json();
}
else {
    pdfParser = require("pdf2json");
}

let _clipboardy;
if (typeof clipboardy !== 'undefined' && clipboardy !== null) {
    _clipboardy = clipboardy;
}
else {
    _clipboardy = require("clipboardy");
}

const fs = require('fs')

var pdfDocumentFields = [];
var pdfDocumentTexts = [];
var pdfDocumentTextLines = [];
var pdfActualFieldValues = [];

function TargetPage_IndexesGet(pdfData) {

    let max_pages = pdfData.Pages.length;
    let target_pages = [];
    if (typeof pages === 'undefined' || pages === null) {
        for (let i = 1; i <= max_pages; i++)
            target_pages.push(parseInt(i));
    }
    else if (parseInt(pages) === pages) {
        pages = (pages > max_pages) ? max_pages : pages;
        for (let i = 1; i <= pages; i++)
            target_pages.push(parseInt(i));
    }
    else {
        pages.split(',').forEach((spec) => {
            if (spec == Number(spec))
                target_pages.push(parseInt(spec));
            else if (spec.includes('-')) {
                let min = spec.split('-')[0];
                let max = spec.split('-')[1];
                for (let i = min; i <= max; i++)
                    target_pages.push(parseInt(i));
            }
        });
    }
    console.log('target_pages: ', target_pages);
    return { max_pages, target_pages };
}

function pdfFieldValidate(searchToken, expectedValues) {

    if (typeof expectedValues !== undefined) console.log("PDF Field Validate (", searchToken, ", ", JSON.stringify(expectedValues), ")"); else console.log("PDF Field Validate (", searchToken, ", ", ", undefined)"); var deepResult = {}; var jsonCompare = function (x, y) { var status = true; if (x === y) { return true; } else if ((typeof x == "object" && x != null) && (typeof y == "object" && y != null)) { for (var prop in x) { if (y.hasOwnProperty(prop)) { var matched = jsonCompare(x[prop], y[prop]); deepResult[prop] = matched ? true : false + " [" + x[prop] + " !== " + y[prop] + "]"; if (!matched && status == true) status = false; } else { return false; } } return status; } else { return false; } }

    /*
     * Find target element
     *	Fields: {"style":48,"T":{"Name":"alpha","id":{"Id":"Given_Name_Text_Box","EN":0},"TI":0,"AM":0,"TU":"First name","x":10.356,"y":23.381,"w":9.375,"h":0.887}
     * 	Texts:  {"x":3.3,"y":27.163,"w":52.547,"sw":0.32553125,"clr":0,"A":"left","R":[{"T":"Address%201%3A","S":4,"TS":[0,14,0,0]}]}
     */

    var targetFields = [].concat.apply([], pdfDocumentFields);
    var targetTexts = [].concat.apply([], pdfDocumentTexts);

    var foundFields = targetFields.filter((field, index) => {

        var found = false;

        found = (field.Id === searchToken);
        if (!found)
            found = (field.Label !== undefined && unescape(field.Label.Value) === unescape(searchToken));
        if (!found)
            found = (field.Label !== undefined && unescape(field.Label.Value).startsWith(unescape(searchToken)));

        return (found);

    });

    if (foundFields.length === 0) {

        foundFields = targetTexts.filter((field, index) => {

            var found = false;

            if (searchToken === "TextBlock") {
                found = (field.Value !== undefined && unescape(field.Value) === unescape(expectedValues));
                if (!found)
                    found = (field.Value !== undefined && unescape(field.Value).startsWith(unescape(expectedValues)));
            }
            else {
                found = (field.Value !== undefined && unescape(field.Value) === unescape(searchToken));
                if (!found)
                    found = (field.Value !== undefined && unescape(field.Value).startsWith(unescape(searchToken)));
            }

            return (found);

        });

    }

    /* if we found more than one field, see if there is a match and then trim to just the one field
     */
    if (foundFields?.length >= 2) {
        console.warn("Field [" + searchToken + "] matched " + foundFields.length + " fields");
        let _found_fields = foundFields.filter((field, index) => {
            return (field.Value === unescape(expectedValues));
        });
        if (_found_fields?.length >= 1)
            foundFields = _found_fields;
    }

    /*
     * If we did not find the target or found too many - error
     */
    if (foundFields?.length === 0) {
        if (searchToken === "TextBlock")
            throw new Error("TextBlock [" + unescape(expectedValues) + "] not found");
        else
            throw new Error("Field [" + searchToken + "] not found");
    }

    /*
     * Get actual value(s)
     */
    var actual_values = foundFields[0];

    /*
     * Copy actual value to console
     */
    var actual_str = JSON.stringify(actual_values).toString();
    if (verbose)
        console.log("actual_values", actual_str);

    /*
     * Validate results if expectedValues is defined
     */
    if (typeof expectedValues !== undefined && expectedValues !== null && expectedValues !== "") {

        var result;

        switch (typeof expectedValues) {
            case "object":
            default:
                result = jsonCompare(expectedValues, actual_values);
                if (result == false)
                    throw new Error("\nPDF Validation:\n" + "(" + searchToken + "): \nResults [" + JSON.stringify(deepResult, null, 2) + "], \nExpected [" + JSON.stringify(expectedValues, null, 2) + "], \nActual: [" + JSON.stringify(actual_values, null, 2) + "]");
                break;
            case "string":
                if (typeof actual_values !== undefined && actual_values.Value !== "") {
                    if (unescape(expectedValues).trim() !== unescape(actual_values.Value).trim()) {
                        throw new Error("\nPDF Validation:\n" + "(" + searchToken + "): \nExpected [" + unescape(expectedValues) + "], \nActual: [" + unescape(actual_values.Value) + "]");
                    }
                    break;
                }

        }

    }

}

return new Promise((resolve, reject) => {

    console.log("new Promise");

    pdfParser.on("pdfParser_dataError", errData => {
        console.log("pdfParser_dataError");
        reject(errData.parserError);
    });

    pdfParser.on("pdfParser_dataReady", pdfData => {
        console.log("pdfParser_dataReady");

        if (verbose) console.log("pdfData.Pages.length", pdfData.Pages.length);

        let { max_pages, target_pages } = TargetPage_IndexesGet(pdfData);

        // Store Texts, Fields in pdfDataTexts, pdfDataFields.  
        //    Note: PageNumber is the index into the arrays
        //

        let current_line_number = 0;
        for (var i = 0; i < max_pages; i++) {

            if (!target_pages.includes((i + 1)))
                continue;

            let current_line_top_y = -1;

            let num_lines = 80;
            let min_y = pdfData.Pages[i].Texts.reduce(function getMin(min_y, textblock) { return Math.min(min_y, textblock.y); }, 1000);
            let max_y = pdfData.Pages[i].Texts.reduce(function getMax(max_y, textblock) { return Math.max(max_y, textblock.y); }, 0);
            console.log("  min_y: " + min_y + ", max_y: " + max_y);
            let line_height = max_y - min_y / num_lines;

            if (verbose) {
                console.log("============= START PAGE " + i + " ===================");
                console.log("pdfData.Pages[i].Texts.length", pdfData.Pages[i].Texts.length);
            }

            if (pdfData.Pages[i].Texts !== undefined && pdfData.Pages[i].Texts.length > 0) {

                if (verbose)
                    console.log("Collect Texts and their values");

                var enhancedTextBlocks = pdfData.Pages[i].Texts.filter((textblock, index) => {

                    try {

                        // Texts:  {"x":3.3,"y":27.163,"w":52.547,"sw":0.32553125,"clr":0,"A":"left","R":[{"T":"Address%201%3A","S":4,"TS":[0,14,0,0]}]}
                        textblock.Page = i;
                        textblock.FieldId = null; // If set then this is the field id of the matching Field in the doc
                        textblock.Label = null;
                        textblock.Value = (typeof textblock.R !== 'undefined') ? unescape(textblock.R[0].T) : null;
                        textblock.Top = textblock.y;
                        textblock.Left = textblock.x;
                        textblock.Bottom = textblock.y + textblock.h;
                        textblock.Right = textblock.x + textblock.w;

                        if (Math.round((textblock.y + Number.EPSILON) * 2000) / 2000 != Math.round((current_line_top_y + Number.EPSILON) * 2000) / 2000) {
                            current_line_top_y = textblock.y;
                            current_line_number++;
                            if (typeof pdfDocumentTextLines[current_line_number] === 'undefined')
                                pdfDocumentTextLines[current_line_number] = "";
                        }
                        textblock.LineNumber = current_line_number;

                        //console.log("   >>>  textblock.Value", textblock.Value, "current_line_number", current_line_number, "current_line_top_y", current_line_top_y)

                        if (textblock.Value !== null && textblock.Value.length > 0) {
                            pdfDocumentTextLines[current_line_number] = pdfDocumentTextLines[current_line_number]
                                + (pdfDocumentTextLines[current_line_number] !== "" ? LINE_TEXTBLOCK_SEPARTOR_TOKEN : "")
                                + textblock.Value;

                            //pdfDocumentTextLines[current_line_number] = pdfDocumentTextLines[current_line_number] + (pdfDocumentTextLines[current_line_number] !== "" ? " " : "") + textblock.Value;
                        }

                        var expectedValue = {};
                        expectedValue["TextBlock"] = typeof (textblock.Value) !== 'undefined' ? textblock.Value : "";
                        pdfActualFieldValues.push(expectedValue);

                        return (typeof textblock.Value !== 'undefined' && textblock.Value !== null);
                    }
                    catch (err) {
                        return false;
                    }

                });
                pdfDocumentTexts.push(enhancedTextBlocks.map(({ Page, LineNumber, FieldId, Label, Value, Top, Left, Bottom, Right, style, x, y, w, h, V, ...theRest }) => ({ Page, LineNumber, FieldId, Label, Value, Top, Left, Bottom, Right, style, x, y, w, h, V })));
            }

            if (pdfData.Pages[i].Fields !== undefined && pdfData.Pages[i].Fields.length > 0) {
                // Collect Fields and their values
                //      
                var enhancedFields = pdfData.Pages[i].Fields.filter((field, index) => {

                    try {
                        // Fields: {"style":48,"T":{"Name":"alpha","id":{"Id":"Given_Name_Text_Box","EN":0},"TI":0,"AM":0,"TU":"First name","x":10.356,"y":23.381,"w":9.375,"h":0.887,"V": "Barry"}
                        field.Page = i;
                        field.Id = field.id.Id;
                        field.Label = null;
                        field.Value = field.V;
                        field.Top = field.y;
                        field.Left = field.x;
                        field.Bottom = field.y + field.h;
                        field.Right = field.x + field.w;

                        var expectedValue = {};
                        expectedValue[field.Id] = typeof (field.Value) !== 'undefined' ? field.Value : "";
                        pdfActualFieldValues.push(expectedValue);

                        return true;
                    }
                    catch (err) {
                        return false;
                    }

                });
                pdfDocumentFields.push(enhancedFields.map(({ Page, Id, Label, Value, Top, Left, Bottom, Right, style, x, y, w, h, V, ...theRest }) => ({ Page, Id, Label, Value, Top, Left, Bottom, Right, style, x, y, w, h, V })));

            }

            if (verbose) {
                console.log("============= END PAGE " + i + " ===================");
                console.log("");
            }

        }

        // Find Labels for each Field
        //
        if (typeof pdfDocumentFields !== 'undefined' && pdfDocumentFields.length !== null && pdfDocumentFields.length > 0) {

            if (verbose)
                console.log("pdfDocumentFields[0].forEach", pdfDocumentFields[0].length);

            pdfDocumentFields[0].forEach((field, index) => {

                //if (field.Id !== "Given_Name_Text_Box")
                //  return;               

                try {

                    field.Label = pdfDocumentTexts[0].reduce((label, textBlock, index) => {

                        var max_vertical_delta = 1;
                        var max_horizontal_delta = 10;

                        if ((Math.abs(field.Top - textBlock.Top) <= max_vertical_delta) // Must be inline
                            && ((textBlock.Left < field.Left) && (field.Left - textBlock.Left) <= max_horizontal_delta)
                            && (!label.hasOwnProperty("Left") || (field.Left - textBlock.Left) < (field.Left - label.Left))
                        ) {
                            //console.log("  MATCH.  field label",  JSON.stringify( textBlock, null, 2));
                            return textBlock;
                        }
                        return label;

                    }, {});

                }
                catch (err) {

                }

            });

        }

        if (typeof exportsTest !== 'undefined' && exportsTest !== null) {
            exportsTest.pdfDocumentFields = pdfDocumentFields;
            exportsTest.pdfDocumentTexts = pdfDocumentTexts;
            exportsTest.pdfActualFieldValues = pdfActualFieldValues;
            exportsTest.pdfDocumentTextLines = pdfDocumentTextLines;
        }

        if (verbose) {
            console.log("=======================================================");
            console.log("============ PARSED FIELD/TEXT COUNTS ==================");
            console.log("=======================================================");
            console.log("pdfDocumentFields    Pages:  " + pdfDocumentFields?.length, '  [0]: ' + pdfDocumentFields[0].length);
            console.log("pdfDocumentTexts     Pages:  " + pdfDocumentTexts?.length, '  [0]: ' + pdfDocumentTexts[0].length);
            console.log("pdfActualFieldValues Counts: " + pdfActualFieldValues?.length);
            console.log("pdfDocumentTextLines Counts: " + pdfDocumentTextLines?.length);
            console.log("=======================================================");
        }

        // Save to clipboard
        _clipboardy.writeSync(JSON.stringify(pdfActualFieldValues));

        //if (pdfDocumentFields.length > 0) {
        //    console.log("pdfDocumentFields", JSON.stringify(pdfDocumentFields, null, 2));
        //    console.log("=======================================================");
        //}
        //console.log("============= pdfActualFieldValues ===================");
        //console.log("pdfActualFieldValues", JSON.stringify(pdfActualFieldValues,null,2)); 
        //var line = 1;
        //pdfDocumentTextLines.forEach(function (field) { console.log("Line#" + line++ + "\t-> ", field); });

        //console.log("=======================================================");

        /* if fieldsToValidate is defined then validate 
         */
        if (typeof fieldsToValidate !== 'undefined' && fieldsToValidate !== null) {
            /*
            * Normalize fields to validate
            *	[{ "Given_Name_Text_Box": "Barry" }, { "Given": "Barry" }, { "Family_Name_Text_Box": "Solomon"}]
            */
            var fields_to_validate = [];
            if (typeof fieldsToValidate !== 'object')
                fields_to_validate.push(fieldsToValidate);
            else
                fields_to_validate = fieldsToValidate;

            /*
            * Execute (Loops each field to validate)
            */
            fields_to_validate.forEach(function (field_to_validate) {

                switch (field_to_validate) {

                    case "Page":
                    case "LineNumber":
                        break;

                    default:

                        field = Object.keys(field_to_validate)[0];
                        expected_values = field_to_validate[field];

                        pdfFieldValidate(field, expected_values);
                        break;
                }

            });
        }

        resolve(pdfData);

    });

    if (typeof fileBuffer !== 'undefined' && fileBuffer !== null) {
        pdfParser.parseBuffer(fileBuffer);
    }
    else if (typeof fileName !== 'undefined' && fileName !== null) {
        pdfParser.loadPDF(fileName);
    }

});


