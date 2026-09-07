import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    Logger
} from "@nestjs/common";
import {Request, Response} from "express";
import { timestamp } from "rxjs";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);
    
    catch(exception: unknown, host: ArgumentsHost){
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let statusCode: number;
        let errorCode: string;
        let message: string;

        if(exception instanceof HttpException){
            statusCode = exception.getStatus();

            const exceptionResponse = exception.getResponse();

            if(typeof exceptionResponse === 'string'){
                message = exceptionResponse;
                errorCode = this.getErrorCode(statusCode);
            }else{
                const responseBody = exceptionResponse as Record<string, unknown>;

                errorCode = typeof responseBody.errorCode === 'string' ? responseBody.errorCode : this.getErrorCode(statusCode);

                message = typeof responseBody.message === 'string' ? responseBody.message : Array.isArray(responseBody.message) ? responseBody.message.join(', ') : 'Request failed'
            }
        }else{
            statusCode = 500;
            errorCode = 'INTERNAL_ERROR';
            message = 'Internal server error';

            this.logger.error(
                exception instanceof Error ? exception.message : 'Unknown error',
                exception instanceof Error ? exception.stack : undefined
            );
        }

        response.status(statusCode).json({
            errorCode,
            message,
            statusCode,
            timestamp: new Date().toISOString(),
            path: request.url
        });
    }
    private getErrorCode(statusCode: number): string {
            const errorCodes: Record<number, string> = {
                400: 'BAD_REQUEST',
                401: 'UNAUTHORIZED',
                403: 'FORBIDDEN',
                404: 'NOT_FOUND',
                409: 'CONFLICT',
                422: 'UNPROCESSABLE_ENTITY'
            }

            return errorCodes[statusCode] ?? 'HTTP_ERROR';
        }
}
