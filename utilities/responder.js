export default function responder(db, message) {}

// function responderOLD(message) {
//     db.collection("users")
//       .doc(message.author.id)
//       .collection("categories")
//       .get()
//       .then((categorySnapshots) => {
//         if (!categorySnapshots.empty) {
//           categories = [];
//           categorySnapshots.forEach((categorySnapshot) =>
//             categories.push({
//               category: categorySnapshot.id,
//               chance: categorySnapshot.data().chance,
//             })
//           );
//           let random = Math.floor(Math.random() * categories.length);
//           const percentageChance = (percentage) =>
//             Math.random() * 100 < percentage;
//           if (percentageChance(categories[random].chance)) {
//             db.collection("responder")
//               .doc(categories[random].category)
//               .collection("links")
//               .get()
//               .then((categorySnapshots) => {
//                 let links = [];
//                 categorySnapshots.forEach((categorySnapshot) => {
//                   links.push(categorySnapshot.data().url);
//                 });
//                 random = Math.floor(Math.random() * links.length);
//                 message.reply(links[random]);
//               });
//           }
//         }
//       });
//   }
