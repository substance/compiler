var JSZip = require("jszip");
var fs = require("fs");
var ncp = require("ncp");



// Sources
// -----------
// 
// http://shapeshed.com/working_with_filesystems_in_nodejs/

var SOURCE_FILE = __dirname + "/data/beyond-simulating-paper.sdf";
var TARGET_DIR = __dirname + "/out";
var INDEX_TEMPLATE = __dirname + "/templates/index.html";

function copyFileSync(source, target) {
  var data = fs.readFileSync(source);
  fs.writeFile(target, data);
  // var fs = require('fs');
  // fs.createReadStream('test.log').pipe(fs.createWriteStream('newLog.log'));
}


// Unpack
// --------
// 
// Takes a Substance document (zip archive including assets) and unpacks it into a destination folder

function unpack(sourceFile, targetDir) {
  var docData = fs.readFileSync(sourceFile);
  var zip = new JSZip(docData);

  if (!fs.existsSync(TARGET_DIR + "/data")) {
    fs.mkdirSync(TARGET_DIR + "/data");
  }

  var rawDoc = zip.files["content.json"].asText();
  var jsonDoc = JSON.parse(rawDoc);

  
  console.log('extracted document to out/*');

  var figures = jsonDoc.nodes.figures.nodes;

  figures.forEach(function(figId) {
    var fig = jsonDoc.nodes[figId];
    var data = zip.files[fig.url].asNodeBuffer();
    fs.writeFileSync(targetDir +"/data/"+fig.url, data);
  });

  // Post processing of document file
  // ----------------
  // Adapt figure urls

  var figures = jsonDoc.nodes.figures.nodes;
  figures.forEach(function(figId) {
    var fig = jsonDoc.nodes[figId];
    fig.url = "data/"+fig.url;
  });
  fs.writeFileSync(TARGET_DIR + "/data/content.json", JSON.stringify(jsonDoc, null, '  '), "utf8");

  console.log('Substance doc successfully extracted:', sourceFile);
  return jsonDoc;
};


// Copy latest reader distribution to target
// --------
// 
// Takes a Substance document (zip archive including assets) and unpacks it into a destination folder

function copyReader(cb) {
  ncp(__dirname+"/node_modules/substance-reader/dist", TARGET_DIR, cb);
  // var sys = require('sys')
  // var exec = require('child_process').exec;
  // function puts(error, stdout, stderr) {
  //   sys.puts(stdout);
  // }
  // exec("cpFileSync", puts);
  // copyFileSync(__dirname+"/node_modules/substance-reader/dist/substance.js", TARGET_DIR+"/substance.js");
}


function renderDoc(doc) {
  var contentNodes = doc.nodes.content.nodes;
  var figureNodes = doc.nodes.figures.nodes;

  var res = ["<h1>"+doc.nodes.document.title+"</h1>"];
  // Render main content nodes
  contentNodes.forEach(function(nodeId) {
    var node = doc.nodes[nodeId];
    if (node.type === "heading") {
      res.push("<h2>"+node.content+"</h2>");
    } else if (node.type === "text") {
      res.push("<p>"+node.content+"</p>");
    }
  });

  var figureNodes = doc.nodes.figures.nodes;

  res.push("<h2>Figures</h2>");
  figureNodes.forEach(function(nodeId) {
    var figure = doc.nodes[nodeId];

    res.push("<h3>"+figure.label+"</h3>");
    console.log('##########FIGURL', figure.url);
    res.push('<img src="'+figure.url+'"/>');
    var caption = doc.nodes[figure.caption];
    if (caption) {
      res.push("<p>"+caption.content+"</p>");
    }
  });
  

  return res.join("\n");
}


// 1. Copy bundled reader to TARGET_DIR

copyReader(function(err) {
  // check errors ?

  // 2. Unpack Substance doc to TARGET_DIR/data
  var doc = unpack(SOURCE_FILE, TARGET_DIR);

  // 3. Generate customized index file 
  var indexHTML = fs.readFileSync(INDEX_TEMPLATE, "utf8");

  indexHTML = indexHTML.replace("{{{{CONTENT}}}}", renderDoc(doc));
  indexHTML = indexHTML.replace("{{{{TITLE}}}}", doc.nodes.document.title);
  fs.writeFileSync(TARGET_DIR+"/index.html", indexHTML, "utf8");
  console.log('now generating index file...');
});
