var JSZip = require("jszip");
var fs = require("fs");
var _ = require("underscore");

var util = require("substance-util");
var Compiler = require("./compiler");
var Article = require("substance-article");


var SOURCE_FILE = __dirname + "/data/substance-network.sdf.zip";
var TARGET_DIR = __dirname + "/out";
var INDEX_TEMPLATE = __dirname + "/templates/index.html";


// Unpack
// --------
// 
// Takes a Substance document (zip archive including assets) and unpacks it into a destination folder

function unpack(sourceFile) {
  var docData = fs.readFileSync(sourceFile);
  var doc = util.zip.unzipFromArrayBuffer(docData, {
    createFromJSON: Article.fromSnapshot
  });
  return doc;
}


// Construct new document
// ----------

var doc = unpack(SOURCE_FILE);
var compiler = new Compiler(doc);
var webDocumentZip = compiler.compile("default");

// Write to disk
_.each(webDocumentZip.files, function(file, fileName) {
  if (fileName.indexOf("html")>=0 || fileName.indexOf("css")>=0) {
    fs.writeFileSync(TARGET_DIR + "/"+fileName, file.asText(), "utf8");  
  } else {
    fs.writeFileSync(TARGET_DIR + "/"+fileName, file.asNodeBuffer());  
  }
    
});