// How many addresses "To" and "Cc" each take: the API's limit.
export const MAX_RECIPIENTS = 10;

// One address: something, an @, a domain with a dot. The mail server has the last word.
const EMAIL_ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

export function isEmailAddress(value: string): boolean {
  return value.length <= 254 && EMAIL_ADDRESS.test(value);
}

// What typing `text` into a list of addresses gives. The text may hold several addresses
// (pasted, or separated by commas, semicolons or spaces). Each valid one is added in lower
// case, as the API stores it; one that is already in the list is dropped without a word.
// Whatever could not be added stays in `rest`, for the user to correct, with the `problem`.
export function addRecipients(
  value: readonly string[],
  text: string,
  max: number = MAX_RECIPIENTS,
): { value: string[]; rest: string; problem: string | null } {
  const next = [...value];
  const rest: string[] = [];
  let problem: string | null = null;

  for (const address of text.toLowerCase().split(/[,;\s]+/)) {
    if (address === "" || next.includes(address)) {
      continue;
    }
    if (!isEmailAddress(address)) {
      rest.push(address);
      problem ??= `"${address}" is not a valid email address. Correct it or clear it.`;
    } else if (next.length >= max) {
      rest.push(address);
      problem ??= `Use ${String(max)} addresses or fewer.`;
    } else {
      next.push(address);
    }
  }
  return { value: next, rest: rest.join(", "), problem };
}
