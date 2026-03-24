const cloudinary = require('../config/cloudinary')();
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

// @desc    Upload single file
// @route   POST /api/v1/uploads
// @access  Private
exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { filename, path: filepath, mimetype, size } = req.file;

    // Determine upload type
    let uploadType = 'general';
    if (mimetype.startsWith('image/')) {
      uploadType = 'image';
    } else if (mimetype === 'application/pdf') {
      uploadType = 'document';
    } else if (mimetype.includes('text') || mimetype.includes('code')) {
      uploadType = 'code';
    }

    // Upload to Cloudinary if configured
    let cloudinaryResult = null;
    if (process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET) {
      
      try {
        cloudinaryResult = await cloudinary.uploader.upload(filepath, {
          folder: `vertex-chamber/${uploadType}`,
          resource_type: 'auto',
          public_id: `${uuidv4()}-${path.parse(filename).name}`,
          overwrite: true
        });

        // Delete local file after successful Cloudinary upload
        await fs.unlink(filepath);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed:', cloudinaryError);
        // Continue with local file storage
      }
    }

    const fileData = {
      filename,
      originalName: filename,
      size,
      mimetype,
      type: uploadType,
      uploadedBy: req.user.id,
      uploadedAt: new Date()
    };

    if (cloudinaryResult) {
      fileData.url = cloudinaryResult.secure_url;
      fileData.provider = 'cloudinary';
      fileData.publicId = cloudinaryResult.public_id;
      fileData.format = cloudinaryResult.format;
    } else {
      // Use local file path (relative to server)
      const relativePath = path.relative(path.join(__dirname, '..'), filepath);
      fileData.url = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
      fileData.provider = 'local';
    }

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      file: fileData
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload multiple files
// @route   POST /api/v1/uploads/multiple
// @access  Private
exports.uploadMultipleFiles = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      const { filename, path: filepath, mimetype, size } = file;

      // Determine upload type
      let uploadType = 'general';
      if (mimetype.startsWith('image/')) {
        uploadType = 'image';
      } else if (mimetype === 'application/pdf') {
        uploadType = 'document';
      } else if (mimetype.includes('text') || mimetype.includes('code')) {
        uploadType = 'code';
      }

      // Upload to Cloudinary if configured
      let cloudinaryResult = null;
      if (process.env.CLOUDINARY_CLOUD_NAME && 
          process.env.CLOUDINARY_API_KEY && 
          process.env.CLOUDINARY_API_SECRET) {
        
        try {
          cloudinaryResult = await cloudinary.uploader.upload(filepath, {
            folder: `vertex-chamber/${uploadType}`,
            resource_type: 'auto',
            public_id: `${uuidv4()}-${path.parse(filename).name}`,
            overwrite: true
          });

          // Delete local file after successful Cloudinary upload
          await fs.unlink(filepath);
        } catch (cloudinaryError) {
          console.error('Cloudinary upload failed:', cloudinaryError);
          // Continue with local file storage
        }
      }

      const fileData = {
        filename,
        originalName: filename,
        size,
        mimetype,
        type: uploadType,
        uploadedBy: req.user.id,
        uploadedAt: new Date()
      };

      if (cloudinaryResult) {
        fileData.url = cloudinaryResult.secure_url;
        fileData.provider = 'cloudinary';
        fileData.publicId = cloudinaryResult.public_id;
        fileData.format = cloudinaryResult.format;
      } else {
        // Use local file path (relative to server)
        const relativePath = path.relative(path.join(__dirname, '..'), filepath);
        fileData.url = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
        fileData.provider = 'local';
      }

      uploadedFiles.push(fileData);
    }

    res.status(200).json({
      success: true,
      message: `${uploadedFiles.length} files uploaded successfully`,
      files: uploadedFiles
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload user avatar
// @route   POST /api/v1/uploads/avatar
// @access  Private
exports.uploadAvatar = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { filename, path: filepath, mimetype } = req.file;

    // Validate it's an image
    if (!mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for avatars'
      });
    }

    let avatarUrl = null;

    // Upload to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET) {
      
      try {
        const cloudinaryResult = await cloudinary.uploader.upload(filepath, {
          folder: 'vertex-chamber/avatars',
          resource_type: 'image',
          public_id: `avatar-${req.user.id}-${Date.now()}`,
          overwrite: true,
          transformation: [
            { width: 200, height: 200, crop: 'fill', gravity: 'face' },
            { radius: 'max' } // Make it circular
          ]
        });

        avatarUrl = cloudinaryResult.secure_url;

        // Delete local file
        await fs.unlink(filepath);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed:', cloudinaryError);
        
        // Use local file
        const relativePath = path.relative(path.join(__dirname, '..'), filepath);
        avatarUrl = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
      }
    } else {
      // Use local file
      const relativePath = path.relative(path.join(__dirname, '..'), filepath);
      avatarUrl = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
    }

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatar: avatarUrl
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload project banner
// @route   POST /api/v1/uploads/project-banner
// @access  Private
exports.uploadProjectBanner = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { filename, path: filepath, mimetype } = req.file;

    // Validate it's an image
    if (!mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for banners'
      });
    }

    let bannerUrl = null;

    // Upload to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET) {
      
      try {
        const cloudinaryResult = await cloudinary.uploader.upload(filepath, {
          folder: 'vertex-chamber/projects/banners',
          resource_type: 'image',
          public_id: `banner-${uuidv4()}`,
          overwrite: true,
          transformation: [
            { width: 1200, height: 400, crop: 'fill' }
          ]
        });

        bannerUrl = cloudinaryResult.secure_url;

        // Delete local file
        await fs.unlink(filepath);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed:', cloudinaryError);
        
        // Use local file
        const relativePath = path.relative(path.join(__dirname, '..'), filepath);
        bannerUrl = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
      }
    } else {
      // Use local file
      const relativePath = path.relative(path.join(__dirname, '..'), filepath);
      bannerUrl = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
    }

    res.status(200).json({
      success: true,
      message: 'Project banner uploaded successfully',
      banner: bannerUrl
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Upload project logo
// @route   POST /api/v1/uploads/project-logo
// @access  Private
exports.uploadProjectLogo = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const { filename, path: filepath, mimetype } = req.file;

    // Validate it's an image
    if (!mimetype.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed for logos'
      });
    }

    let logoUrl = null;

    // Upload to Cloudinary if configured
    if (process.env.CLOUDINARY_CLOUD_NAME && 
        process.env.CLOUDINARY_API_KEY && 
        process.env.CLOUDINARY_API_SECRET) {
      
      try {
        const cloudinaryResult = await cloudinary.uploader.upload(filepath, {
          folder: 'vertex-chamber/projects/logos',
          resource_type: 'image',
          public_id: `logo-${uuidv4()}`,
          overwrite: true,
          transformation: [
            { width: 200, height: 200, crop: 'fill' },
            { radius: 20 } // Rounded corners
          ]
        });

        logoUrl = cloudinaryResult.secure_url;

        // Delete local file
        await fs.unlink(filepath);
      } catch (cloudinaryError) {
        console.error('Cloudinary upload failed:', cloudinaryError);
        
        // Use local file
        const relativePath = path.relative(path.join(__dirname, '..'), filepath);
        logoUrl = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
      }
    } else {
      // Use local file
      const relativePath = path.relative(path.join(__dirname, '..'), filepath);
      logoUrl = `/uploads/${relativePath.split(path.sep).slice(-2).join('/')}`;
    }

    res.status(200).json({
      success: true,
      message: 'Project logo uploaded successfully',
      logo: logoUrl
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete uploaded file
// @route   DELETE /api/v1/uploads/:id
// @access  Private
exports.deleteFile = async (req, res, next) => {
  try {
    const { fileUrl, provider, publicId } = req.body;

    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'File URL is required'
      });
    }

    if (provider === 'cloudinary' && publicId) {
      // Delete from Cloudinary
      try {
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error('Failed to delete from Cloudinary:', cloudinaryError);
      }
    } else if (provider === 'local') {
      // Delete local file
      try {
        const filePath = path.join(__dirname, '..', 'public', fileUrl);
        await fs.unlink(filePath);
      } catch (fsError) {
        console.error('Failed to delete local file:', fsError);
      }
    }

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get upload statistics
// @route   GET /api/v1/uploads/stats
// @access  Private/Admin
exports.getUploadStats = async (req, res, next) => {
  try {
    // This would query the database for upload statistics
    // For now, return mock data
    
    const stats = {
      totalUploads: 0,
      totalSize: '0 MB',
      byType: {
        images: 0,
        documents: 0,
        code: 0,
        other: 0
      },
      byProvider: {
        cloudinary: 0,
        local: 0
      },
      recentUploads: []
    };

    res.status(200).json({
      success: true,
      stats
    });
  } catch (error) {
    next(error);
  }
};