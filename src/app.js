import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { errorResponse } from './helpers/response.helper';

const app = express();

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', routes);

// Base route
app.get('/', (req, res) => {
  res.send('Welcome to the Customer App API update code version2');
});

// 404 handler
app.use((req, res) => {
  return errorResponse(res, 'Route not found', 'Not Found', 404);
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  return errorResponse(res, err, 'Internal Server Error', 500);
});

export default app;
