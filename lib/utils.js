percentageChance = (percentage) => Math.random() * 100 < percentage;

randomIntFromInterval = (min, max) =>
  Math.floor(Math.random() * (max - min + 1) + min);

module.exports = { percentageChance, randomIntFromInterval };
