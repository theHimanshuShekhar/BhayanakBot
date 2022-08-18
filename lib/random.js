const sum = require("sugar/array/sum");

module.exports.randomGames = async (message) => {
  if (message.content) {
    isSixtyNine(message);
    isFourTwenty(message);
  }
};

// function to sum all numeric values in string
const isSixtyNine = (message) => {
  let nums;
  let numsInString = message.content.match(/\d+/g);
  if (numsInString) nums = numsInString.map((num) => parseInt(num));

  if (sum(nums) === 69) {
    let replyText = `\nAll the numbers in this message add up to 69!\nCongrats!\n`;
    let calculation = "";
    nums.forEach((num, index) => {
      calculation = calculation
        .concat(`${num}`)
        .concat(index !== nums.length - 1 ? " + " : " ");
    });
    calculation = calculation.concat("= 69");
    message.reply(replyText.concat(calculation));
  }
};


// function to sum all numeric values in string
const isFourTwenty = (message) => {
  let nums;
  let numsInString = message.content.match(/\d+/g);
  if (numsInString) nums = numsInString.map((num) => parseInt(num));

  if (sum(nums) === 420) {
    let replyText = `
    🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿
    \nAll the numbers in this message add up to 420!\nCongrats!\n
    🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿🌿
    `;
    let calculation = "";
    nums.forEach((num, index) => {
      calculation = calculation
        .concat(`${num}`)
        .concat(index !== nums.length - 1 ? " + " : " ");
    });
    calculation = calculation.concat("= 420");
    message.reply(replyText.concat(calculation));
  }
};
