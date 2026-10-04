// Exact two-cohort season calculation, no Monte Carlo noise.
// m equally funded Players, n unfunded Players. No deposits or transfers
// change scores during the season. Paid-group death weight is m - alpha.
// With alpha=0.5, individual weight = 1 - 0.5 * luck share.
const alpha = 0.5,
  supply = 1000,
  probability = new Float64Array(supply + 1);
for (let m = 1; m <= supply; m++) {
  probability[0] = 1;
  for (let n = 1; n <= supply - m; n++) {
    probability[n] =
      ((m - alpha) * probability[n] + n * probability[n - 1]) / (m + n - alpha);
  }
  if ([1, 10, 100, 500].includes(m))
    console.log(
      JSON.stringify({
        funded: m,
        unfunded: supply - m,
        fundedGroupWinProbability: probability[supply - m],
        unfundedGroupWinProbability: 1 - probability[supply - m],
      }),
    );
}
