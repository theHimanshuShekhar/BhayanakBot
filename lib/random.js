const sum = require("sugar/array/sum");

module.exports.randomGames = async (message) => {
  isSixtyNine(message);
};

// function to sum all numeric values in string
const isSixtyNine = (message) => {
  let nums = message.content.match(/\d+/g).map((num) => parseInt(num));

  console.log("isSixtyNine", sum(nums));
  if (sum(nums) === 69) {
    let replyText = `\nAll the numbers in this message add up to 69!\nCongrats!\n`;
    let calculation = "";
    nums.forEach((num, index) => {
      calculation = calculation
        .concat(`${num}`)
        .concat(index !== nums.length ? " + " : " ");
    });
    calculation = calculation.concat("= 69");
    console.log(calculation);
    message.reply(replyText.concat(calculation));
  }
};
