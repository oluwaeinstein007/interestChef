import 'dotenv/config';
import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import feedRoutes from './routes/feed.js';

const app: Express = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', feedRoutes);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
