import express from 'express';
import Notification from '../models/notification.js';
import Driver from '../models/driver.js';
import Investor from '../models/investor.js';
import FcmToken from '../models/fcmToken.js';
import { sendToTokens, sendToToken, default as initFirebase } from '../lib/firebaseAdmin.js';
import { authenticateToken } from './middleware.js';

const router = express.Router();

// Register FCM token for a user
router.post('/register-token', authenticateToken, async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    const userType = req.body.userType || req.query.userType || 'driver';
    // Support passing userId in body when authentication is bypassed in dev
    const userId = (req.user && req.user.id) || req.body.userId || req.query.userId;

    if (!token) return res.status(400).json({ success: false, message: 'token is required' });

    const update = { token, lastSeen: new Date() };
    if (userId) update.userId = userId;
    if (userType) update.userType = userType;

    await FcmToken.findOneAndUpdate({ token }, update, { upsert: true, new: true });

    res.json({ success: true, message: 'Token registered/updated' });
  } catch (err) {
    console.error('Error registering token:', err);
    res.status(500).json({ success: false, message: 'Failed to register token', error: err.message });
  }
});

// Unregister FCM token
router.post('/unregister-token', authenticateToken, async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    if (!token) return res.status(400).json({ success: false, message: 'token is required' });
    await FcmToken.deleteOne({ token });
    res.json({ success: true, message: 'Token unregistered' });
  } catch (err) {
    console.error('Error unregistering token:', err);
    res.status(500).json({ success: false, message: 'Failed to unregister token', error: err.message });
  }
});

// Helper to send FCM to users
async function _sendFcmToUserIds(userType, ids, title, message, payload = {}) {
  if (!ids || ids.length === 0) return;
  const tokens = [];
  const tokenDocs = await FcmToken.find({ userId: { $in: ids }, userType }).lean();
  tokenDocs.forEach(t => tokens.push(t.token));
  if (tokens.length === 0) return;
  try {
    const notification = { title: title || '', body: message || '' };
    await sendToTokens(tokens, notification, { payload: JSON.stringify(payload) }).catch(err => {
      console.error('Error sending multicast FCM:', err);
    });
  } catch (err) {
    console.error('Error sending FCM:', err);
  }
}

// ============= ADMIN NOTIFICATION ROUTES (MUST BE BEFORE PARAMETERIZED ROUTES) =============

// GET /api/notifications/admin/drivers - Fetch drivers for admin selection
router.get('/admin/drivers', authenticateToken, async (req, res) => {
  try {
    console.log('GET /api/notifications/admin/drivers - Request received');
    const search = req.query.search || '';
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = {};
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query = {
        $or: [
          { name: searchRegex },
          { phone: searchRegex },
          { mobile: searchRegex },
          { email: searchRegex }
        ]
      };
    }

    const drivers = await Driver.find(query)
      .select('_id name phone mobile email')
      .limit(limit)
      .lean();

    res.json({ drivers });
  } catch (err) {
    console.error('Error fetching drivers:', err);
    res.status(500).json({ message: 'Failed to fetch drivers', error: err.message });
  }
});

// GET /api/notifications/admin/investors - Fetch investors for admin selection
router.get('/admin/investors', authenticateToken, async (req, res) => {
  try {
    const search = req.query.search || '';
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    let query = {};
    
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query = {
        $or: [
          { investorName: searchRegex },
          { phone: searchRegex },
          { email: searchRegex }
        ]
      };
    }

    const investors = await Investor.find(query)
      .select('_id investorName phone email')
      .limit(limit)
      .lean();

    res.json({ investors });
  } catch (err) {
    console.error('Error fetching investors:', err);
    res.status(500).json({ message: 'Failed to fetch investors', error: err.message });
  }
});

// POST /api/notifications/admin/send-specific - Send notifications to specific users
router.post('/admin/send-specific', authenticateToken, async (req, res) => {
  try {
    console.log('POST /api/notifications/admin/send-specific - Request received', req.body);
    const { driverIds = [], investorIds = [], title, message, link, sendType, scheduledTime } = req.body;

    // Validation
    if ((!driverIds || driverIds.length === 0) && (!investorIds || investorIds.length === 0)) {
      return res.status(400).json({ message: 'Please provide at least one driver or investor ID' });
    }

    if (!title && !message) {
      return res.status(400).json({ message: 'Please provide at least a title or message' });
    }

    if (sendType === 'schedule' && !scheduledTime) {
      return res.status(400).json({ message: 'Please provide scheduled time for scheduled notifications' });
    }

    const results = [];
    const currentTime = new Date();

    // Handle scheduled notifications
    if (sendType === 'schedule') {
      const scheduledDate = new Date(scheduledTime);
      if (scheduledDate <= currentTime) {
        return res.status(400).json({ message: 'Scheduled time must be in the future' });
      }

      // For scheduled notifications, create notification documents with a scheduled flag
      // You can process these later with a cron job or scheduled task runner
      
      // Create notifications for drivers
      if (driverIds && driverIds.length > 0) {
        const driverNotifications = driverIds.map(driverId => ({
          userId: driverId,
          userType: 'driver',
          type: 'admin_notification',
          title: title || '',
          message: message || '',
          payload: { link: link || '' },
          scheduledFor: scheduledDate,
          isScheduled: true,
          read: false
        }));
        
        const created = await Notification.insertMany(driverNotifications);
        results.push(...created.map(n => ({ userId: n.userId, userType: 'driver', notificationId: n._id })));
      }

      // Create notifications for investors
      if (investorIds && investorIds.length > 0) {
        const investorNotifications = investorIds.map(investorId => ({
          userId: investorId,
          userType: 'investor',
          type: 'admin_notification',
          title: title || '',
          message: message || '',
          payload: { link: link || '' },
          scheduledFor: scheduledDate,
          isScheduled: true,
          read: false
        }));
        
        const created = await Notification.insertMany(investorNotifications);
        results.push(...created.map(n => ({ userId: n.userId, userType: 'investor', notificationId: n._id })));
      }

      return res.json({
        success: true,
        message: `Notification scheduled for ${results.length} user(s)`,
        results,
        scheduledFor: scheduledDate
      });
    }

    // Handle immediate notifications
    // Create notifications for drivers
    if (driverIds && driverIds.length > 0) {
      const driverNotifications = driverIds.map(driverId => ({
        userId: driverId,
        userType: 'driver',
        type: 'admin_notification',
        title: title || '',
        message: message || '',
        payload: { link: link || '' },
        read: false
      }));
      
      const created = await Notification.insertMany(driverNotifications);
      results.push(...created.map(n => ({ userId: n.userId, userType: 'driver', notificationId: n._id })));
      
      // Emit socket event for real-time notifications if socket.io is available
      if (req.app.locals.io) {
        driverIds.forEach(driverId => {
          req.app.locals.io.to(`driver:${driverId}`).emit('new_notification', {
            title: title || '',
            message: message || '',
            link: link || ''
          });
        });
      }

      // Send FCM notifications (if any tokens registered)
      try {
        await _sendFcmToUserIds('driver', driverIds, title, message, { link: link || '' });
      } catch (err) {
        console.error('Error sending FCM to drivers:', err);
      }
    }

    // Create notifications for investors
    if (investorIds && investorIds.length > 0) {
      const investorNotifications = investorIds.map(investorId => ({
        userId: investorId,
        userType: 'investor',
        type: 'admin_notification',
        title: title || '',
        message: message || '',
        payload: { link: link || '' },
        read: false
      }));
      
      const created = await Notification.insertMany(investorNotifications);
      results.push(...created.map(n => ({ userId: n.userId, userType: 'investor', notificationId: n._id })));
      
      // Emit socket event for real-time notifications if socket.io is available
      if (req.app.locals.io) {
        investorIds.forEach(investorId => {
          req.app.locals.io.to(`investor:${investorId}`).emit('new_notification', {
            title: title || '',
            message: message || '',
            link: link || ''
          });
        });
      }

      // Send FCM notifications (if any tokens registered)
      try {
        await _sendFcmToUserIds('investor', investorIds, title, message, { link: link || '' });
      } catch (err) {
        console.error('Error sending FCM to investors:', err);
      }
    }

    res.json({
      success: true,
      message: `Notification sent to ${results.length} user(s)`,
      results
    });
  } catch (err) {
    console.error('Error sending notification to specific users:', err);
    res.status(500).json({ message: 'Failed to send notification', error: err.message });
  }
});

// POST /api/notifications/admin/send - Send notifications to all users in selected apps
router.post('/admin/send', authenticateToken, async (req, res) => {
  try {
    console.log('POST /api/notifications/admin/send - Request received', req.body);
    const { apps = [], data = {}, sendType, scheduledTime } = req.body;

    // Validation
    if (!apps || apps.length === 0) {
      return res.status(400).json({ message: 'Please select at least one app' });
    }

    const currentTime = new Date();
    const results = [];

    // Handle scheduled notifications
    if (sendType === 'schedule') {
      if (!scheduledTime) {
        return res.status(400).json({ message: 'Please provide scheduled time for scheduled notifications' });
      }

      const scheduledDate = new Date(scheduledTime);
      if (scheduledDate <= currentTime) {
        return res.status(400).json({ message: 'Scheduled time must be in the future' });
      }

      // Process each selected app
      for (const app of apps) {
        let notificationData = {};
        
        if (data.common) {
          notificationData = data.common;
        } else if (app === 'customer' && data.driver) {
          notificationData = data.driver;
        } else if (app === 'driver' && data.investor) {
          notificationData = data.investor;
        }

        if (!notificationData.title && !notificationData.message) {
          continue; // Skip if no data for this app
        }

        if (app === 'customer') {
          // Get all drivers
          const drivers = await Driver.find({}).select('_id').lean();
          const driverIds = drivers.map(d => d._id);

          if (driverIds.length > 0) {
            const driverNotifications = driverIds.map(driverId => ({
              userId: driverId,
              userType: 'driver',
              type: 'admin_notification',
              title: notificationData.title || '',
              message: notificationData.message || '',
              payload: { link: notificationData.link || '' },
              scheduledFor: scheduledDate,
              isScheduled: true,
              read: false
            }));

            const created = await Notification.insertMany(driverNotifications);
            results.push(...created.map(n => ({ userId: n.userId, userType: 'driver', notificationId: n._id })));
          }
        } else if (app === 'driver') {
          // Get all investors
          const investors = await Investor.find({}).select('_id').lean();
          const investorIds = investors.map(i => i._id);

          if (investorIds.length > 0) {
            const investorNotifications = investorIds.map(investorId => ({
              userId: investorId,
              userType: 'investor',
              type: 'admin_notification',
              title: notificationData.title || '',
              message: notificationData.message || '',
              payload: { link: notificationData.link || '' },
              scheduledFor: scheduledDate,
              isScheduled: true,
              read: false
            }));

            const created = await Notification.insertMany(investorNotifications);
            results.push(...created.map(n => ({ userId: n.userId, userType: 'investor', notificationId: n._id })));
          }
        }
      }

      return res.json({
        success: true,
        message: `Notification scheduled for ${results.length} user(s)`,
        results,
        scheduledFor: scheduledDate
      });
    }

    // Handle immediate notifications
    // Process each selected app
    for (const app of apps) {
      let notificationData = {};
      
      if (data.common) {
        notificationData = data.common;
      } else if (app === 'customer' && data.driver) {
        notificationData = data.driver;
      } else if (app === 'driver' && data.investor) {
        notificationData = data.investor;
      }

      if (!notificationData.title && !notificationData.message) {
        continue; // Skip if no data for this app
      }

      if (app === 'customer') {
        // Get all drivers
        const drivers = await Driver.find({}).select('_id').lean();
        const driverIds = drivers.map(d => d._id);

        if (driverIds.length > 0) {
          const driverNotifications = driverIds.map(driverId => ({
            userId: driverId,
            userType: 'driver',
            type: 'admin_notification',
            title: notificationData.title || '',
            message: notificationData.message || '',
            payload: { link: notificationData.link || '' },
            read: false
          }));

          const created = await Notification.insertMany(driverNotifications);
          results.push(...created.map(n => ({ userId: n.userId, userType: 'driver', notificationId: n._id })));

          // Emit socket events for real-time notifications
          if (req.app.locals.io) {
            driverIds.forEach(driverId => {
              req.app.locals.io.to(`driver:${driverId}`).emit('new_notification', {
                title: notificationData.title || '',
                message: notificationData.message || '',
                link: notificationData.link || ''
              });
            });
          }

          // Send FCM notifications (if tokens are registered)
          try {
            await _sendFcmToUserIds('driver', driverIds, notificationData.title, notificationData.message, { link: notificationData.link || '' });
          } catch (err) {
            console.error('Error sending FCM to drivers:', err);
          }
        }
      } else if (app === 'driver') {
        // Get all investors
        const investors = await Investor.find({}).select('_id').lean();
        const investorIds = investors.map(i => i._id);

        if (investorIds.length > 0) {
          const investorNotifications = investorIds.map(investorId => ({
            userId: investorId,
            userType: 'investor',
            type: 'admin_notification',
            title: notificationData.title || '',
            message: notificationData.message || '',
            payload: { link: notificationData.link || '' },
            read: false
          }));

          const created = await Notification.insertMany(investorNotifications);
          results.push(...created.map(n => ({ userId: n.userId, userType: 'investor', notificationId: n._id })));

          // Emit socket events for real-time notifications
          if (req.app.locals.io) {
            investorIds.forEach(investorId => {
              req.app.locals.io.to(`investor:${investorId}`).emit('new_notification', {
                title: notificationData.title || '',
                message: notificationData.message || '',
                link: notificationData.link || ''
              });
            });
          }

          // Send FCM notifications (if tokens are registered)
          try {
            await _sendFcmToUserIds('investor', investorIds, notificationData.title, notificationData.message, { link: notificationData.link || '' });
          } catch (err) {
            console.error('Error sending FCM to investors:', err);
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Notification sent to ${results.length} user(s)`,
      results
    });
  } catch (err) {
    console.error('Error sending notification to all users:', err);
    res.status(500).json({ message: 'Failed to send notification', error: err.message });
  }
});

// ============= REGULAR NOTIFICATION ROUTES =============

// Get recent notifications
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const list = await Notification.find().sort({ createdAt: -1 }).limit(limit).lean();
    console.info('Returning notifications count:', list.length);
    res.json({ data: list });
  } catch (err) {
    console.error('Failed to fetch notifications:', err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Mark all as read (MUST BE BEFORE /:id/mark-read)
router.patch('/mark-all-read', async (req, res) => {
  try {
    await Notification.updateMany({ read: false }, { read: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to mark all notifications read:', err);
    res.status(500).json({ message: 'Failed to update notifications' });
  }
});

// Mark a notification as read (PARAMETERIZED ROUTE - MUST BE LAST)
router.patch('/:id/mark-read', async (req, res) => {
  try {
    const updated = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true }).lean();
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true, notification: updated });
  } catch (err) {
    console.error('Failed to mark notification read:', err);
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

// Debug route - to help identify routing issues
router.all('*', (req, res) => {
  console.log(`Unmatched notification route: ${req.method} ${req.path}`);
  res.status(404).json({ 
    message: 'Notification route not found', 
    method: req.method, 
    path: req.path,
    availableRoutes: [
      'GET /api/notifications/',
      'GET /api/notifications/admin/drivers',
      'GET /api/notifications/admin/investors',
      'POST /api/notifications/admin/send-specific',
      'POST /api/notifications/admin/send',
      'PATCH /api/notifications/mark-all-read',
      'PATCH /api/notifications/:id/mark-read'
    ]
  });
});

export default router;
