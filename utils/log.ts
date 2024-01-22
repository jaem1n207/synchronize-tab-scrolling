type ColorType = 'success' | 'info' | 'error' | 'warning' | keyof typeof COLORS;

/**
 * 콘솔에 색상을 입혀서 출력합니다.
 * @param message 출력할 메시지
 * @param type 출력할 메시지의 타입
 * @param force 강제로 출력할 것인지 여부.
 * ex) build-static-script.js처럼 `vite build`를 실행하기 전에 실행해야 할 경우
 */
const colorLog = (message: string, type?: ColorType, force = false) => {
	if (!force && !process.env.__WATCH__) return;

	let color: string = type || COLORS.FgBlack;

	switch (type) {
		case 'success':
			color = COLORS.FgGreen;
			break;
		case 'info':
			color = COLORS.FgBlue;
			break;
		case 'error':
			color = COLORS.FgRed;
			break;
		case 'warning':
			color = COLORS.FgYellow;
			break;
	}

	console.log(color, message);
};

const COLORS = {
	Reset: '\x1b[0m',
	Bright: '\x1b[1m',
	Dim: '\x1b[2m',
	Underscore: '\x1b[4m',
	Blink: '\x1b[5m',
	Reverse: '\x1b[7m',
	Hidden: '\x1b[8m',
	FgBlack: '\x1b[30m',
	FgRed: '\x1b[31m',
	FgGreen: '\x1b[32m',
	FgYellow: '\x1b[33m',
	FgBlue: '\x1b[34m',
	FgMagenta: '\x1b[35m',
	FgCyan: '\x1b[36m',
	FgWhite: '\x1b[37m',
	BgBlack: '\x1b[40m',
	BgRed: '\x1b[41m',
	BgGreen: '\x1b[42m',
	BgYellow: '\x1b[43m',
	BgBlue: '\x1b[44m',
	BgMagenta: '\x1b[45m',
	BgCyan: '\x1b[46m',
	BgWhite: '\x1b[47m'
} as const;

export default colorLog;
