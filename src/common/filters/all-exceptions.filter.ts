import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { randomUUID } from 'crypto';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 10000;
    let message = '服务器错误';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message =
        typeof res === 'string'
          ? res
          : (res as { message?: string | string[] }).message?.toString() || exception.message;
      if (status === 401) code = 10001;
      else if (status === 403) code = 10002;
      else if (status === 404) code = 10004;
      else if (status === 400 || status === 422) code = 10003;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      code,
      message,
      data: null,
      timestamp: Date.now(),
      requestId: randomUUID(),
    });
  }
}
