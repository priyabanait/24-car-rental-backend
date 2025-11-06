import express from 'express';
import cloudinary from '../lib/cloudinary.js';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    // dynamic folder name may be provided in the multipart form field `folder`
    const folder = (req.body && req.body.folder) ? req.body.folder : 'uploads';
    // keep original filename (without extension) as public_id if provided
    const originalName = file.originalname?.replace(/\.[^/.]+$/, '') || undefined;
    return {
      folder,
      public_id: originalName,
      resource_type: 'auto',
    };
  },
});

const parser = multer({ storage });
const router = express.Router();

// Single file upload
// Accepts form-data with field `file` and optional `folder` field.
router.post('/', parser.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    // multer-storage-cloudinary attaches the uploaded file info to req.file
    return res.json({
      url: req.file.path,
      public_id: req.file.filename || req.file.public_id || null,
      originalname: req.file.originalname || null,
      size: req.file.size || null,
    });
  } catch (err) {
    console.error('Upload failed', err);
    return res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

export default router;
