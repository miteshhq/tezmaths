export const MATH_QUOTES = [
  "Math is the music of reason.",
  "Pure mathematics is, in its way, the poetry of logical ideas.",
  "The only way to learn mathematics is to do mathematics.",
  "Without mathematics, there's nothing you can do. Everything around you is mathematics.",
  "Mathematics is not about numbers, equations, computations, or algorithms: it is about understanding.",
  "Life is a math equation. In order to gain the most, you have to know how to convert negatives into positives.",
  "Go down deep enough into anything and you will find mathematics.",
  "The essence of mathematics is not to make simple things complicated, but to make complicated things simple.",
  "Mathematics knows no races or geographic boundaries; for mathematics, the cultural world is one country.",
  "Mathematics is the language with which God has written the universe.",
  "In mathematics you don't understand things. You just get used to them.",
  "Mathematics is the art of giving the same name to different things.",
  "The mathematician's patterns, like the painter's or the poet's, must be beautiful.",
  "Mathematics is the most beautiful and most powerful creation of the human spirit.",
  "As far as the laws of mathematics refer to reality, they are not certain.",
];

export const getRandomQuote = () => {
  return MATH_QUOTES[Math.floor(Math.random() * MATH_QUOTES.length)];
};
