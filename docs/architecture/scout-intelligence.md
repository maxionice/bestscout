# Scout-intelligence architecture

BestScout's development projection is an original, deterministic and explainable
heuristic. It does not reproduce a Football Manager formula and must not be read as
a guarantee about the simulation's future result.

## Development probability

A projection requires age, current ability (CA) and potential ability (PA). Four
normalized factors contribute to the base probability:

- development runway from age: 40%;
- mentality from professionalism, ambition and determination: 30%;
- resilience from natural fitness and inverse injury proneness: 15%;
- club environment from training and youth facilities: 15%.

An unavailable factor uses a neutral score of 50%, while the separately reported
data confidence falls. A bounded difficulty modifier accounts for the size of the
remaining CA-to-PA gap. The displayed projected peak is:

```text
CA + round((PA - CA) × probability)
```

It can never exceed PA. Available player attributes receive a conservative share
of their remaining headroom, scaled by probability and age runway, and are capped
at 20. Every factor, score, weight, observation state and explanation crosses the
Tauri boundary with the result.

## Smart lists

- **Wonderkids** meet configurable age and minimum-PA thresholds.
- **Bargains** have a known non-negative value below the configured ceiling and a
  projected peak of at least 145. The value index is projected peak per million
  euros, with a lower bound in the denominator for numerical stability.
- **Free agents** have neither a current club nor a contract-club reference.
- **Expiring contracts** end between the selected game-date and the configurable
  number of following days. Expired contracts are not mixed into this list.

The report stores each player once and annotates category flags, so large live
snapshots are not duplicated four times in memory. Sorting is deterministic.
