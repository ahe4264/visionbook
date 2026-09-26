# Figure spec: ReinforceMDPLoop

**figure_id:** `ReinforceMDPLoop`

**Reference image (open this with the Read tool — it renders visually):**
`C:/Users/ahe42/Documents/figure-benchmark/public/images/cs/2d/ReinforceMDPLoop.png`

## input_prompt

This figure shows the agent–environment interaction loop in reinforcement learning, depicted as a closed directed cycle between two rounded rectangular boxes filled with light teal. The upper box is labeled “Agent” with the policy π[a_t | s_t] inscribed inside, and the lower, larger box is labeled “Environment” with the state transition probability Pr(s_{t+1} | s_t, a_t) inscribed inside. Orange arrows with arrowheads form the loop: one arrow routes from the Agent box rightward and downward into the Environment box, carrying the action a_t; a second arrow returns from the Environment to the Agent carrying the current state s_t, while a third routes the next state s_{t+1} back around; additional arrow paths carry rewards r_t and r_{t+1}, and a label identifies the reward function Pr(r_{t+1} | s_t, a_t). Small white-background rectangles along the arrow paths isolate variable labels — State, Action, and Reward — for readability. This figure introduces the Markov Decision Process (MDP) framework at the core of reinforcement learning, showing how the agent observes a state, selects an action according to its policy, and receives a reward and next state from the environment in a repeating closed loop.

## interactions

- Animate one full MDP time step: sequentially highlight state s_t leaving the Environment → entering the Agent → action a_t flowing back → reward r_{t+1} and next state s_{t+1} returned from the Environment
- Click the Agent box to highlight the policy π[a_t|s_t] and the action arrow a_t pointing toward the environment
- Click the Environment box to highlight both the state transition Pr(s_{t+1}|s_t,a_t) and the reward function Pr(r_{t+1}|s_t,a_t) labels
