import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled API Error:', err);
  
  const statusCode = err.httpStatus || 500;
  const message = err.message || 'Internal Server Error';
  
  res.status(statusCode).json({
    error: {
      message,
      code: err.code,
      details: err.context || undefined
    }
  });
};
