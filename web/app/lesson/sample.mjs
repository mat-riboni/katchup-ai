// Built-in English sample lesson: 7 slides, transcript per slide, glossary,
// and pre-written answers used when no Claude API key is available.

export const SAMPLE_LESSON = {
  id: 'katchup-sample', // same id in the backend after `npm run seed:sample`
  title: 'Neural networks: from optimization to backpropagation',
  course: 'Sample lesson',
  source: 'sample',
  glossary: {
    loss: { term: 'Loss function', aliases: ['loss function', 'loss'], definition: 'Measures the errors the model makes on the training set. Training means looking for the parameters that make it small.' },
    gd: { term: 'Gradient descent', aliases: ['gradient descent'], definition: 'Start from initial parameters and update them step by step to move towards a minimum of the loss.', formula: 'θ ← θ − η · ∇L(θ)' },
    param: { term: 'Parameters', aliases: ['parameters', 'parameter'], definition: 'The values of the model (weights and bias) that training changes to reduce the loss.' },
    lr: { term: 'Learning rate', aliases: ['learning rate'], definition: 'The factor that multiplies the gradient in the update: it sets the size of each step.', formula: 'η' },
    gradient: { term: 'Gradient', aliases: ['gradient', 'gradients'], definition: 'The vector of derivatives of the loss with respect to the model parameters.' },
    momentum: { term: 'Momentum', aliases: ['momentum'], definition: 'Accumulates information from previous gradients, so optimization moves faster in a useful direction and can escape an unfavourable region.' },
    minibatch: { term: 'Mini-batch', aliases: ['mini-batch', 'minibatch'], definition: 'A subset of M samples chosen from the N training samples that reasonably represents the data. One step uses one batch, not the whole dataset.' },
    epoch: { term: 'Epoch', aliases: ['epoch', 'epochs'], definition: 'One full pass over the data: it ends when the batches have covered every sample. Training usually needs several epochs.' },
    regularizing: { term: 'Regularizing effect', aliases: ['regularizing effect'], definition: 'The randomness of batches can keep the model from memorizing the training set and improve generalization.' },
    perceptron: { term: 'Perceptron', aliases: ['perceptron'], definition: 'An ancestor of neural networks (Rosenblatt): a linear combination of the inputs followed by a step function.', formula: 'ŷ = sign(w·x + b)' },
    weights: { term: 'Weights', aliases: ['weights', 'weight'], definition: 'Coefficients that multiply the inputs in the linear combination. They are what the model learns.' },
    bias: { term: 'Bias', aliases: ['bias'], definition: 'A constant term added to the score. With a constant input of 1 it becomes one more weight.', formula: 'w·x + b = [w, b]·[x, 1]' },
    step: { term: 'Step function', aliases: ['step function'], definition: 'The non-linearity of the perceptron: it decides based on the sign of the score.' },
    logreg: { term: 'Logistic regression', aliases: ['logistic regression'], definition: 'A linear combination followed by a sigmoid: the same structure as the perceptron, with a smooth non-linearity.' },
    score: { term: 'Linear score', aliases: ['score'], definition: 'The value w·x + b before the threshold: positive gives a positive prediction, negative a negative one.' },
    boundary: { term: 'Decision boundary', aliases: ['decision boundary', 'boundary'], definition: 'The set of points where w·x + b = 0: a line in 2D, a hyperplane in more dimensions. The vector w is perpendicular to it.', formula: 'w·x + b = 0' },
    online: { term: 'Online algorithm', aliases: ['online algorithm'], definition: 'Looks at one sample at a time and updates the parameters only when the prediction is wrong.' },
    activation: { term: 'Activation function', aliases: ['activation functions', 'activation function'], definition: 'A non-linearity applied after each linear transformation. Without it, stacked layers would collapse into a single one.' },
    relu: { term: 'ReLU', aliases: ['relu'], definition: 'Returns the input if it is positive and zero if it is negative: simple, with a change of slope at zero.', formula: 'ReLU(x) = max(0, x)' },
    mlp: { term: 'Feedforward network (MLP)', aliases: ['mlp', 'feedforward network', 'multilayer perceptron'], definition: 'Linear layers alternated with activations: information flows from the input to the output through the layers.' },
    backprop: { term: 'Backpropagation', aliases: ['backpropagation'], definition: 'Applies the chain rule backwards over the graph to get the gradient of the loss with respect to the parameters.' },
    graph: { term: 'Computational graph', aliases: ['computational graph'], definition: 'Breaks a complex function into simple operations with intermediate variables, computed once and reused.' },
    reverse: { term: 'Reverse mode', aliases: ['reverse mode'], definition: 'Differentiation that starts from the output and goes backwards: efficient with many parameters and a scalar loss.' },
  },
  slides: [
    {
      number: 1, title: 'Minimizing the loss', figure: 'loss', formula: 'θ ← θ − η · ∇L(θ)',
      bullets: ['A [[loss|loss function]] measures the errors on the training set', '[[gd|Gradient descent]] moves the [[param|parameters]] towards a minimum', 'New parameters = old − [[lr|learning rate]] × [[gradient]]', '[[momentum|Momentum]] accumulates information from past gradients'],
      transcript: 'Last time we saw how to minimize the error on the training set: the model has to fit the observed data, we measure the errors with a loss function and we try to minimize it. The loss landscape can have many minima, so we need a procedure to find a good one: gradient descent. We start from initial parameters and update them; the new parameters are the old ones minus the learning rate times the gradient of the loss. There are other optimization procedures: momentum accumulates information from previous gradients, moving faster in a useful direction and possibly escaping an unfavourable region.',
    },
    {
      number: 2, title: 'Mini-batch SGD', figure: 'batch',
      bullets: ['The full gradient is expensive: it depends on N examples and on the parameters', 'A [[minibatch|mini-batch]] of M examples represents the data', 'All batches covered = one [[epoch]]', 'Randomness causes oscillations, but also a [[regularizing|regularizing effect]]'],
      transcript: 'In plain gradient descent the loss is evaluated on the whole training set: we compute an error for every example, and the cost depends on the number of examples and on the number of parameters. To reduce it we use fewer examples at a time: we pick a subset of M samples that reasonably represents the data. Each step uses one batch; when all the data has been covered we have completed an epoch, and we usually need several epochs. The loss does not go down perfectly smoothly, there are bumps and oscillations, but we can still reach a reasonable minimum. The randomness can also have a regularizing effect and help generalization.',
    },
    {
      number: 3, title: 'The perceptron', figure: 'perceptron', formula: 'ŷ = sign(w·x + b)',
      bullets: ['[[perceptron|Perceptron]]: an ancestor of neural networks (Rosenblatt)', 'Input x, [[weights]] w and [[bias]] b', 'Linear combination + [[step|step function]]', 'Like [[logreg|logistic regression]], but with a step'],
      transcript: 'Let us go back to history for a moment: in the fifties people started to formalize models that learn from data. An ancestor of today\'s networks is Rosenblatt\'s perceptron: it receives a vector of numbers, with a constant input equal to one for the bias, combines them with weights and passes the result through a non-linear step function. This should remind you of logistic regression, which uses a sigmoid. The model is inspired by a simplified neuron, but the analogy should not be taken literally: backpropagation, which we will see today, is an optimization mechanism and does not describe biological neurons.',
    },
    {
      number: 4, title: 'Linear classifier', figure: 'plane', formula: 'y · (w·x + b) < 0  ⇒  error',
      bullets: ['Positive [[score]] → class +, negative → class −', 'The [[boundary|boundary]] is a line: w·x + b = 0', 'The vector w is perpendicular to the boundary', 'With labels −1/+1: y · score negative = error'],
      transcript: 'A positive linear score gives a positive prediction, a negative one a negative prediction. The score is the dot product between x and w plus the bias, which we can absorb by adding a constant one to x. Geometrically it is a linear classifier: in two dimensions the boundary is a line, in more dimensions a hyperplane, and the weight vector is perpendicular to it. With labels minus one and plus one we check correctness by multiplying the label by the score: a positive product is right, a negative one is wrong. This test only works for labels minus one and plus one, not zero and one.',
    },
    {
      number: 5, title: 'The update rule', figure: 'update', formula: 'error ⇒ w ← w + y · x',
      bullets: ['[[online|Online algorithm]]: one sample at a time', 'Correct prediction → no change', 'Wrong prediction → w ← w + y · x', 'With y = −1 we subtract x and the line rotates'],
      transcript: 'The perceptron is an online algorithm: it looks at one sample at a time and makes a prediction; if it is wrong it updates the parameters, if it is right it leaves them unchanged. In the example the first point has label minus one but its dot product with w is positive, so the score times the label is negative: an error. The update adds y times x to w; since y is minus one, the new vector is the old one minus x and the line changes orientation. Then we move to the next sample and repeat: every error produces an update, a correct sample changes nothing.',
    },
    {
      number: 6, title: 'Why we need non-linearities', figure: 'layers',
      bullets: ['Linear layers in a row collapse into a single linear layer', 'Between transformations we need [[activation|activation functions]]', '[[relu|ReLU]]: lets positives through, zeroes negatives', 'An [[mlp|MLP]] alternates linear layers and activations'],
      transcript: 'To build a network we combine several units: each output of a fully connected layer is a weighted sum of the inputs followed by a non-linearity, not necessarily a sigmoid. ReLU returns the input if it is positive and zero if it is negative. Composing only linear functions would not be enough: a linear function of a linear function is still linear, and a long sequence of linear layers collapses into a single one. So we need non-linearities between the linear transformations. The multilayer perceptron is also called a deep feedforward network because information flows from the input towards the output.',
    },
    {
      number: 7, title: 'Backpropagation', figure: 'graph', formula: 'f = (x + y) · z',
      bullets: ['[[backprop|Backpropagation]] applies the chain rule backwards', 'The [[graph|computational graph]] breaks the function into simple operations', 'Forward pass: values. Backward pass: derivatives', 'With [[reverse|reverse mode]] one pass gives the gradient for all parameters'],
      transcript: 'The gradient of a large network cannot be written by hand or approximated with finite differences. We use the chain rule organized on a computational graph: the function is broken into simple operations with intermediate variables, computed once and reused. In the forward pass we compute the values up to the loss; in the backward pass we start from the derivative of f with respect to itself, which is one, and multiply the incoming gradient by the local gradient. In the example f = (x + y) z with x = −2, y = 5, z = −4: q = 3 and f = −12; df/dz = 3, df/dq = −4, and so −4 for x and y as well. Since the loss is a scalar, reverse mode avoids a separate computation for every parameter.',
    },
  ],
  // Pre-written answers. Context answers only use slides before the one they belong to.
  sampleAnswers: {
    1: {
      context: 'This slide **opens the lesson**, so there is nothing earlier to catch up on. The lecturer starts from the goal of the previous lecture.\n\n**To remember**\n- A model has to fit the data it observes during training.\n- Errors are measured with a loss function, and the goal is to minimize it.',
      explain: '**In short**\nTo make a model learn, we move its parameters, one step at a time, towards values that reduce the loss.\n\n**Step by step**\n1. The loss function measures how wrong the model is on the training set.\n2. The loss landscape has many minima: we need a procedure to find a good one.\n3. In gradient descent the new parameters are the old ones minus the learning rate times the gradient.\n4. Momentum accumulates previous gradients and helps move faster in a useful direction.\n\n**Why it matters**\nIt is the basic mechanism used to train every model in this lesson.',
    },
    2: {
      context: 'This slide solves a problem left open on **slide 1**: computing the gradient on the whole training set is expensive.\n\n**To remember**\n- In gradient descent the loss is evaluated on all N examples (slide 1).\n- New parameters = old parameters − learning rate × gradient (slide 1).',
      explain: '**In short**\nInstead of using all N examples at every step, we use a small batch of M examples: each step is cheaper and the path is noisier.\n\n**Step by step**\n1. We pick M samples that reasonably represent the data.\n2. Each update uses one batch: its cost depends on M, not N.\n3. When the batches have covered all the data, one epoch is complete; usually we need several.\n4. The loss can bump and oscillate, but still reaches a reasonable minimum.\n\n**Why it matters**\nThe randomness also has a regularizing effect and can improve generalization.',
    },
    3: {
      context: 'The topic changes: after **how** we optimize (slides 1–2), we now see **what** we optimize, starting with the first model that learns from data.\n\n**To remember**\n- The gradient is the gradient of the loss with respect to the parameters (slide 1).\n- Each step can use a mini-batch instead of the whole dataset (slide 2).',
      explain: '**In short**\nThe perceptron takes a vector of numbers, combines it linearly with weights and decides with a step function.\n\n**Step by step**\n1. The input x is a vector; a constant input of 1 lets us include the bias.\n2. The score is the weighted sum of the inputs plus the bias.\n3. A non-linear step turns the score into a decision.\n4. It has the same structure as logistic regression, which uses a sigmoid instead.\n\n**Why it matters**\nIt is the ancestor of neural networks, inspired by a very simplified neuron.',
    },
    4: {
      context: '**Slide 3** introduced the perceptron and its score w·x + b. Here we read that score geometrically.\n\n**To remember**\n- The perceptron combines the inputs with weights and adds a bias (slide 3).\n- A step function turns the score into a decision (slide 3).',
      explain: '**In short**\nThe perceptron is a linear classifier: a line (in 2D) separates the two classes, and w is perpendicular to it.\n\n**Step by step**\n1. The boundary is the set of points where w·x + b = 0.\n2. Points on opposite sides get opposite predictions through the sign.\n3. With labels −1 and +1, the product y · score tells whether the classification is right.\n4. A negative product means an error; the test does not work with labels 0/1.\n\n**Why it matters**\nThis is the criterion the update rule uses.',
    },
    5: {
      context: 'This slide uses the error test from **slide 4** to correct the weights.\n\n**To remember**\n- y · score negative = wrong prediction (slide 4).\n- The boundary is set by w and b, and w is perpendicular to it (slide 4).',
      explain: '**In short**\nThe perceptron learns one sample at a time and changes the weights only when it is wrong.\n\n**Step by step**\n1. Take a sample and compute the prediction.\n2. If it is right, the parameters stay the same.\n3. If it is wrong, add y · x to w.\n4. With y = −1 the update subtracts x and the line changes orientation.\n\n**Why it matters**\nIt is a minimal example of learning: error, correction, new parameter.',
    },
    6: {
      context: 'We move from a single unit to several units in a row.\n\n**To remember**\n- Each unit combines its inputs linearly with weights (slide 3).\n- A single unit draws one linear boundary (slide 4) and learns from its errors (slide 5).',
      explain: '**In short**\nStacking linear layers is not enough: we need non-linearities between one layer and the next.\n\n**Step by step**\n1. A linear function of a linear function is still linear.\n2. A long sequence of linear layers equals one single linear layer.\n3. Between layers we insert activation functions, such as a sigmoid or ReLU.\n4. ReLU returns the input if it is positive and zero if it is negative.\n\n**Why it matters**\nThis is what lets the network represent complex relationships.',
    },
    7: {
      context: 'Back to **slide 1**: to update the parameters we need the gradient, and for large networks it cannot be computed by hand.\n\n**To remember**\n- The update uses the gradient of the loss with respect to the parameters (slide 1).\n- A network is a chain of linear layers and activations (slide 6).',
      explain: '**In short**\nBackpropagation computes the gradient of the loss by reusing the intermediate results of the computational graph.\n\n**Step by step**\n1. The function is broken into simple operations with intermediate variables.\n2. The forward pass computes all values up to the loss.\n3. The backward pass starts from df/df = 1 and multiplies local and incoming gradients.\n4. In the example (x + y) · z with x = −2, y = 5, z = −4 we get q = 3, f = −12 and derivatives −4, −4, 3.\n\n**Why it matters**\nWith a single scalar output, reverse mode gives the gradient for all parameters in one pass.',
    },
  },
};

/** Returns a fresh copy so the UI can never mutate the built-in lesson. */
export const sampleLesson = () => structuredClone(SAMPLE_LESSON);
