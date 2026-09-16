const { Router } = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const driverRoutes = require('./driverRoutes');
const assignmentRoutes = require('./assignmentRoutes');
const tripRoutes = require('./tripRoutes');
const locationRoutes = require('./locationRoutes');
const fleetRoutes = require('./fleetRoutes');
const maintenanceRoutes = require('./maintenanceRoutes');
const fuelRoutes = require('./fuelRoutes');
const expenseRoutes = require('./expenseRoutes');
const documentRoutes = require('./documentRoutes');
const alertRoutes = require('./alertRoutes');
const notificationRoutes = require('./notificationRoutes');
const geofenceRoutes = require('./geofenceRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const reportRoutes = require('./reportRoutes');

const router = Router();

router.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'ok' } }));

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/drivers', driverRoutes);
router.use('/assignments', assignmentRoutes);
router.use('/trips', tripRoutes);
router.use('/location', locationRoutes);
router.use('/fleet', fleetRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/fuel', fuelRoutes);
router.use('/expenses', expenseRoutes);
router.use('/documents', documentRoutes);
router.use('/alerts', alertRoutes);
router.use('/notifications', notificationRoutes);
router.use('/geofences', geofenceRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/reports', reportRoutes);

module.exports = router;
