import 'dotenv/config';
import app from './app';
import db from './models';

const PORT = process.env.PORT || 3000;

console.log('Diagnostic: server.js loaded');

// ── Catch any error that crashes the server and print it clearly ──
process.on('uncaughtException', (err) => {
  console.error('\n❌ UNCAUGHT EXCEPTION — server will exit');
  console.error('   Name   :', err.name);
  console.error('   Message:', err.message);
  console.error('   Stack  :\n', err.stack);
  console.log('Diagnostic: process.exit(1) called from uncaughtException');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('\n❌ UNHANDLED PROMISE REJECTION — server will exit');
  console.error('   Reason :', reason);
  if (reason?.stack) console.error('   Stack  :\n', reason.stack);
  console.log('Diagnostic: process.exit(1) called from unhandledRejection');
  process.exit(1);
});

const startServer = async () => {
  console.log('Diagnostic: startServer() initiated');
  try {
    console.log('Diagnostic: Authenticating with database...');
    await db.sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    if (process.env.DB_SYNC_ALTER === 'true') {
      console.log('Diagnostic: Synchronizing database (alter: true)...');
      await db.sequelize.sync({ alter: true });
      console.log('✅ Database synchronized.');
    }

    console.log(`Diagnostic: Attempting to listen on port ${PORT}...`);
    const server = app.listen(PORT, () => {
      console.log(`✅ Server is running on port ${PORT}`);
      console.log(`   Routes ready:`);
      console.log(`   POST /api/credit          — public (no auth)`);
      console.log(`   POST /api/auth/login       — public`);
      console.log(`   GET  /api/orders           — requires JWT`);
      console.log(`   ...all other /api/* routes — requires JWT`);
    });

    server.on('error', (err) => {
      console.error('\n❌ SERVER ERROR');
      console.error('   Message:', err.message);
      console.error('   Stack  :\n', err.stack);
      console.log('Diagnostic: process.exit(1) called from server error event');
      process.exit(1);
    });

  } catch (error) {
    console.error('\n❌ STARTUP FAILED');
    console.error('   Message:', error.message);
    console.error('   Stack  :\n', error.stack);
    console.log('Diagnostic: process.exit(1) called from startServer catch block');
    process.exit(1);
  }
};

startServer();
