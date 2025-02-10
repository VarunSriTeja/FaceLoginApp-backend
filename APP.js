const express = require("express");
const faceapi = require("face-api.js");
const mongoose = require("mongoose");
const multer = require("multer");
const { Canvas, Image } = require("canvas");
const canvas = require("canvas");
const fileUpload = require("express-fileupload");
faceapi.env.monkeyPatch({ Canvas, Image });
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());

// Middleware for JSON Parsing
app.use(express.json());

// Serve Uploaded Images
app.use("/uploads", express.static("uploads"));


// Initiating the models
async function LoadModels() {
    // Load the models
    // __dirname gives the root directory of the server
    await faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/models");
    await faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/models");
    await faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/models");
  }
  LoadModels();

// Configure Multer Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/"); // Save images in 'uploads' directory
    },
    filename: function (req, file, cb) {
      cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
  });
  
const upload = multer({ storage: storage });


// Defining the MongoDB Schema
const faceSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    
  },
  descriptions: {
    type: Array,
    required: true,
  },
});

const FaceModel = mongoose.model("Face", faceSchema);


app.post("/api/auth/register", upload.array("images", 3), async (req, res) => {
    try {
      const descriptions = [];
      for (let file of req.files) {
        const img = await canvas.loadImage(file.path);
        const detections = await faceapi.detectSingleFace(img)
          .withFaceLandmarks()
          .withFaceDescriptor();
        descriptions.push(detections.descriptor);
      }
  
      const newFace = new FaceModel({
        label: req.body.label,
        descriptions: descriptions,
      });
  
      await newFace.save();
      res.json({ message: "Face data stored successfully" });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Something went wrong" });
    }
  });

const uploadLogin = multer({ dest: "uploads/" }).single("image");

app.post("/api/auth/login", uploadLogin, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    let faces = await FaceModel.find();
    let labeledDescriptors = faces
      .filter(face => face.descriptions.length > 0) // Ensure valid descriptors
      .map(face => new faceapi.LabeledFaceDescriptors(
        String(face.label),
        face.descriptions.map(desc => 
          Array.isArray(desc) ? new Float32Array(desc) : new Float32Array(Object.values(desc))
        )
      ));

    // If no valid descriptors are found, return an error
    if (labeledDescriptors.length === 0) {
      return res.status(400).json({ message: "No valid face data found" });
    }

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

    const img = await canvas.loadImage(req.file.path);
    const detections = await faceapi.detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detections) {
      return res.status(400).json({ message: "No face detected" });
    }

    const bestMatch = faceMatcher.findBestMatch(detections.descriptor);

    if (bestMatch.label !== "unknown") {
      return res.json({ message: "Verified", label: bestMatch.label });
    } else {
      return res.json({ message: "Unverified" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong" });
  }
});




// add your mongo key instead of the ***
mongoose.connect(
    "mongodb://localhost:27017/faceAuth",
    {
    
    }
  ).then(() => {
    app.listen(process.env.PORT || 5005);
    console.log("DB connected and server us running.");
  }).catch((err) => {
    console.log(err);
  });
