import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { SoapController } from './controller';

dotenv.config();

const app: Express = express();
  const port = process.env.PORT;
  let soapController = new SoapController();

  app.get('/', (req: Request, res: Response) => {
    let tables = [
      'shipment',
      // 'shipment_stop',
      // 'shipment_stop_d',
      // 'order_release',
      // 'ob_order_base',
      // 'ship_unit'
      // 'view_shipment_order_release' //INSERT_DATE field unknown
    ];
    soapController.getDataInterval(tables,'2022-01-01','2022-12-31');
    res.send('SOAP TS');
  });

  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at https://localhost:${port}`);
  });