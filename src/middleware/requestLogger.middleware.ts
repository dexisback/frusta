import type { Request, Response, NextFunction } from "express";


export function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction
)  {
    const start = Date.now();
    res.on("finish", ()=>{
        const duration = Date.now() - start
        console.log(`${req.method}  ${req.originalUrl}  ${res.statusCode}  ${duration}ms`)
    })
    next()

}

//logs method, url, statusCode, and duration
