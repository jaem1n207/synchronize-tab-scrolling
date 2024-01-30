// export const readJson = async (path: string) => {
//   const file = Bun.file(path);

//   const contents = await file.json();

//   return contents;
// };

// export const writeFile = async (path: string, data: string) => {
//   await Bun.write(path, data);
// };

// export const writeJSON = async (path: string, value: string, space = 2) => {
//   const json = JSON.stringify(value, null, space);
//   await writeFile(path, json);
// };

// // export const writeJSON = async (path, data, space = 2) => {
// //   const json = JSON.stringify(data, null, space);
// //   await fs_1.promises.writeFile(path, json);
// // };
