import { throttle } from "../utils/utils";

describe("throttle util", () => {
  it("스로틀 함수는 함수를 호출해야합니다", () => {
    const mockFn = jest.fn();
    const throttledFn = throttle(mockFn, 100);

    throttledFn();
    throttledFn();
    throttledFn();

    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it("500ms 내에 100번 호출되면 함수는 5번 호출되어야합니다", () => {
    jest.useFakeTimers();
    const funcSpy = jest.fn();
    const throttledFunc = throttle(funcSpy, 100);

    for (let index = 0; index < 100; index++) {
      throttledFunc();
      jest.advanceTimersByTime(5);
    }

    expect(funcSpy).toHaveBeenCalledTimes(5);
  });

  it("컨텍스트가 바인딩 된 경우 함수는 바인딩 된 컨텍스트에서 호출되어야합니다", () => {
    const mockFn = jest.fn();
    const context1 = { name: "Context 1" };
    const context2 = { name: "Context 2" };
    const throttledFn1 = throttle(mockFn, 100).bind(context1);
    const throttledFn2 = throttle(mockFn, 100).bind(context2);

    throttledFn1();
    throttledFn2();
    throttledFn1();

    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("음수 시간이 지정된 경우 함수를 즉시 실행해야합니다", () => {
    const mockFn = jest.fn();
    const throttledFn = throttle(mockFn, -100);

    throttledFn();

    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
