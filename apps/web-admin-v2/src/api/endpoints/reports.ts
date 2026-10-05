/**
 * Reports & Analytics Endpoints (HIGH API: /s/v1/system/reports/...)
 */

import { httpRequest } from '../http';
import {
  LeaderboardResponse,
  OtpSeries,
  RegistrationsSeries,
  ReportOverview,
  SessionsSeries,
} from '../types';

export async function H80_getReportOverview(query?: { from?: string; to?: string }): Promise<ReportOverview> {
  const res = await httpRequest<ReportOverview>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/reports/overview',
    query,
  });
  return res.data;
}

export async function H81_getRegistrationsSeries(query?: {
  from?: string;
  to?: string;
  interval?: 'day' | 'week' | 'month';
}): Promise<RegistrationsSeries> {
  const res = await httpRequest<RegistrationsSeries>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/reports/registrations',
    query,
  });
  return res.data;
}

export async function H82_getSessionsSeries(query?: {
  from?: string;
  to?: string;
  interval?: 'day' | 'week' | 'month';
}): Promise<SessionsSeries> {
  const res = await httpRequest<SessionsSeries>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/reports/sessions',
    query,
  });
  return res.data;
}

export async function H83_getOtpSeries(query?: {
  from?: string;
  to?: string;
  interval?: 'day' | 'week' | 'month';
}): Promise<OtpSeries> {
  const res = await httpRequest<OtpSeries>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/reports/otp',
    query,
  });
  return res.data;
}

export async function H84_getLeaderboard(query?: { limit?: number }): Promise<LeaderboardResponse> {
  const res = await httpRequest<LeaderboardResponse>({
    target: 'HIGH',
    method: 'GET',
    path: '/s/v1/system/reports/leaderboard',
    query,
  });
  return res.data;
}
