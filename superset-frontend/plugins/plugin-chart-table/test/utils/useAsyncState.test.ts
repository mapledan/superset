/**
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
import { renderHook, act } from '@testing-library/react-hooks';
import useAsyncState from '../../src/DataTable/utils/useAsyncState';

const noop = () => {};

test('returns the initial value on first render', () => {
  const { result } = renderHook(() => useAsyncState('hello', noop));
  expect(result.current[0]).toBe('hello');
});

test('syncs external initialValue changes when shouldSync is undefined', () => {
  let externalValue = 'first';
  const { result, rerender } = renderHook(() =>
    useAsyncState(externalValue, noop),
  );
  expect(result.current[0]).toBe('first');

  externalValue = 'second';
  rerender();
  expect(result.current[0]).toBe('second');
});

test('syncs external initialValue changes when shouldSync returns true', () => {
  let externalValue = 'first';
  const { result, rerender } = renderHook(() =>
    useAsyncState(externalValue, noop, 0, () => true),
  );

  externalValue = 'updated';
  rerender();
  expect(result.current[0]).toBe('updated');
});

// Ruten patch 005: shouldSync guard prevents overwriting in-progress user input
test('does not sync external initialValue when shouldSync returns false', () => {
  let externalValue = 'initial';
  const { result, rerender } = renderHook(() =>
    useAsyncState(externalValue, noop, 0, () => false),
  );

  act(() => {
    result.current[1]('user-typed');
  });

  externalValue = 'server-updated';
  rerender();

  // The external update should be blocked because shouldSync returns false
  expect(result.current[0]).toBe('user-typed');
});

test('setBoth updates local value immediately', () => {
  const { result } = renderHook(() => useAsyncState('original', noop));
  act(() => {
    result.current[1]('changed');
  });
  expect(result.current[0]).toBe('changed');
});
