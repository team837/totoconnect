const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
    cloudinary,
    params: (req, file) => ({
        folder: "toto/users/photos",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
        transformation: [
            { width: 1080, height: 1080, crop: "limit" },
            { quality: "auto:good" },
            { fetch_format: "auto" },
        ],
        public_id: `${req.userId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    }),
});

const uploadPhotos = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per photo
}).single("photo"); // We'll upload one by one for simplicity in the current UI flow

module.exports = uploadPhotos;
