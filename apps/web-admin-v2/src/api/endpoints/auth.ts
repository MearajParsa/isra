/**
 * Auth Endpoints (LOW API: /c/v1/auth/...)
 */

import { httpRequest } from '../http';
import {
  AuthResult,
  OtpChallenge,
  OtpRequestBody,
  OtpVerifyBody,
  PasswordLoginBody,
  RefreshResult,
  StepUpResult,
  StepUpVerifyBody,
} from '../types';

export async function L01_requestOtp(body: OtpRequestBody): Promise<OtpChallenge> {
  const res = await httpRequest<OtpChallenge>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/otp/request',
    body,
  });
  return res.data;
}

export async function L02_verifyOtp(body: OtpVerifyBody): Promise<AuthResult> {
  const res = await httpRequest<AuthResult>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/otp/verify',
    body,
  });
  return res.data;
}

export async function L03_loginPassword(body: PasswordLoginBody): Promise<AuthResult> {
  const res = await httpRequest<AuthResult>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/login/password',
    body,
  });
  return res.data;
}

export async function L04_refresh(body?: { refreshToken?: string }): Promise<RefreshResult> {
  const res = await httpRequest<RefreshResult>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/refresh',
    body: body || {},
  });
  return res.data;
}

export async function L05_logout(): Promise<Record<string, never>> {
  const res = await httpRequest<Record<string, never>>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/logout',
  });
  return res.data;
}

export async function L06_requestStepUpOtp(): Promise<OtpChallenge> {
  const res = await httpRequest<OtpChallenge>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/step-up/otp/request',
  });
  return res.data;
}

export async function L07_verifyStepUpOtp(body: StepUpVerifyBody): Promise<StepUpResult> {
  const res = await httpRequest<StepUpResult>({
    target: 'LOW',
    method: 'POST',
    path: '/c/v1/auth/step-up/otp/verify',
    body,
  });
  return res.data;
}
