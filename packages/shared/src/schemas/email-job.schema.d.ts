import { z } from 'zod';
export declare const emailJobRecipientSchema: z.ZodObject<{
    recipientId: z.ZodOptional<z.ZodString>;
    externalId: z.ZodOptional<z.ZodString>;
    cpfCnpjHash: z.ZodOptional<z.ZodString>;
    razaoSocial: z.ZodOptional<z.ZodString>;
    nome: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    externalId?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    recipientId?: string | undefined;
    cpfCnpjHash?: string | undefined;
}, {
    email: string;
    externalId?: string | undefined;
    razaoSocial?: string | undefined;
    nome?: string | undefined;
    recipientId?: string | undefined;
    cpfCnpjHash?: string | undefined;
}>;
export declare const emailSendJobDataSchema: z.ZodObject<{
    outboxId: z.ZodString;
    companyId: z.ZodString;
    requestId: z.ZodString;
    to: z.ZodString;
    cc: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    bcc: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    subject: z.ZodEffects<z.ZodString, string, string>;
    htmlRef: z.ZodString;
    replyTo: z.ZodOptional<z.ZodString>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    recipient: z.ZodObject<{
        recipientId: z.ZodOptional<z.ZodString>;
        externalId: z.ZodOptional<z.ZodString>;
        cpfCnpjHash: z.ZodOptional<z.ZodString>;
        razaoSocial: z.ZodOptional<z.ZodString>;
        nome: z.ZodOptional<z.ZodString>;
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
        externalId?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        recipientId?: string | undefined;
        cpfCnpjHash?: string | undefined;
    }, {
        email: string;
        externalId?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        recipientId?: string | undefined;
        cpfCnpjHash?: string | undefined;
    }>;
    attempt: z.ZodNumber;
    enqueuedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    to: string;
    subject: string;
    recipient: {
        email: string;
        externalId?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        recipientId?: string | undefined;
        cpfCnpjHash?: string | undefined;
    };
    outboxId: string;
    requestId: string;
    companyId: string;
    enqueuedAt: string;
    htmlRef: string;
    attempt: number;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
}, {
    to: string;
    subject: string;
    recipient: {
        email: string;
        externalId?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        recipientId?: string | undefined;
        cpfCnpjHash?: string | undefined;
    };
    outboxId: string;
    requestId: string;
    companyId: string;
    enqueuedAt: string;
    htmlRef: string;
    attempt: number;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
}>;
export declare const emailSendJobOptionsSchema: z.ZodObject<{
    jobId: z.ZodString;
    ttl: z.ZodDefault<z.ZodNumber>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    delay: z.ZodOptional<z.ZodNumber>;
    removeOnComplete: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    removeOnFail: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strict", z.ZodTypeAny, {
    jobId: string;
    ttl: number;
    removeOnComplete: boolean;
    removeOnFail: boolean;
    priority?: number | undefined;
    delay?: number | undefined;
}, {
    jobId: string;
    ttl?: number | undefined;
    priority?: number | undefined;
    delay?: number | undefined;
    removeOnComplete?: boolean | undefined;
    removeOnFail?: boolean | undefined;
}>;
export declare const emailSendJobResultSchema: z.ZodObject<{
    sesMessageId: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<["SENT", "FAILED", "RETRYING"]>;
    processedAt: z.ZodString;
    durationMs: z.ZodNumber;
    errorCode: z.ZodOptional<z.ZodString>;
    errorReason: z.ZodOptional<z.ZodString>;
    attempt: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    status: "SENT" | "FAILED" | "RETRYING";
    durationMs: number;
    attempt: number;
    processedAt: string;
    sesMessageId?: string | undefined;
    errorCode?: string | undefined;
    errorReason?: string | undefined;
}, {
    status: "SENT" | "FAILED" | "RETRYING";
    durationMs: number;
    attempt: number;
    processedAt: string;
    sesMessageId?: string | undefined;
    errorCode?: string | undefined;
    errorReason?: string | undefined;
}>;
export declare const validateEmailJobData: (data: unknown) => {
    to: string;
    subject: string;
    recipient: {
        email: string;
        externalId?: string | undefined;
        razaoSocial?: string | undefined;
        nome?: string | undefined;
        recipientId?: string | undefined;
        cpfCnpjHash?: string | undefined;
    };
    outboxId: string;
    requestId: string;
    companyId: string;
    enqueuedAt: string;
    htmlRef: string;
    attempt: number;
    cc?: string[] | undefined;
    bcc?: string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    tags?: string[] | undefined;
};
export type EmailJobRecipientInput = z.input<typeof emailJobRecipientSchema>;
export type EmailJobRecipient = z.output<typeof emailJobRecipientSchema>;
export type EmailSendJobDataInput = z.input<typeof emailSendJobDataSchema>;
export type EmailSendJobData = z.output<typeof emailSendJobDataSchema>;
export type EmailSendJobOptionsInput = z.input<typeof emailSendJobOptionsSchema>;
export type EmailSendJobOptions = z.output<typeof emailSendJobOptionsSchema>;
export type EmailSendJobResultInput = z.input<typeof emailSendJobResultSchema>;
export type EmailSendJobResult = z.output<typeof emailSendJobResultSchema>;
