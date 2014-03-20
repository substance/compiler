var JSZip = require("jszip");
var fs = require("fs");
var _ = require("underscore");

var util = require("substance-util");
var Compiler = require("./compiler");
var Article = require("substance-article");


var SOURCE_FILE = process.argv[2] ||  __dirname + "/data/substance-network.sdf.zip";
var TARGET_DIR = process.argv[3] || __dirname + "/out";

if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR);
}

// Construct new document
// ----------

var docData = fs.readFileSync(SOURCE_FILE);

var doc = util.zip.unzipFromArrayBuffer(docData, {
  createFromJSON: Article.fromSnapshot // passes a factory method
});

// var doc = unpack(SOURCE_FILE);
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