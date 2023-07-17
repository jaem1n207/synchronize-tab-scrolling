import React from "react";

const Kbd = (props: { children?: React.ReactNode; wide?: boolean }) => {
  const { wide, ...rest } = props;
  const width = wide ? "w-10" : "w-5";

  return (
    <kbd
      className={`inline-flex items-center justify-center px-2 py-1 text-xs font-medium leading-4 text-neutral-100 bg-neutral-700 rounded ${width}`}
      {...rest}
    />
  );
};
export default Kbd;
