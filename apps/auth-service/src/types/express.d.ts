import 'express';

declare module 'express' {
    interface Request {
        user?: {
            sub:string,
            iat:number,
            exp:number
        }
    }
}