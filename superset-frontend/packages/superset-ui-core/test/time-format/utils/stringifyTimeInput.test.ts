/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import stringifyTimeInput from '../../../src/time-format/utils/stringifyTimeInput';

const fmt = (d: Date) => d.toISOString().slice(0, 10);

test('returns "null" for null input', () => {
  expect(stringifyTimeInput(null, fmt)).toBe('null');
});

test('returns "undefined" for undefined input', () => {
  expect(stringifyTimeInput(undefined, fmt)).toBe('undefined');
});

test('passes Date objects through directly', () => {
  const d = new Date('2024-01-15T00:00:00Z');
  expect(stringifyTimeInput(d, fmt)).toBe('2024-01-15');
});

test('converts numeric ms timestamp to Date', () => {
  const ms = new Date('2024-03-01T00:00:00Z').getTime();
  expect(stringifyTimeInput(ms, fmt)).toBe('2024-03-01');
});

test('converts numeric string (ms timestamp) to Date — Ruten patch 003', () => {
  const ms = String(new Date('2024-06-01T00:00:00Z').getTime());
  expect(stringifyTimeInput(ms, fmt)).toBe('2024-06-01');
});

test('converts ISO date string to Date without NaN — Ruten patch 003', () => {
  expect(stringifyTimeInput('2024-01-01', fmt)).toBe('2024-01-01');
});

test('converts ISO datetime string to Date — Ruten patch 003', () => {
  expect(stringifyTimeInput('2024-07-04T12:00:00', fmt)).toBe('2024-07-04');
});
