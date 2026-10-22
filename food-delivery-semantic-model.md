# Food Delivery — Semantic Model

A simple semantic model of a food delivery system, made of three entities, two relationships, two rules and four actions.

## Diagram

```
Delivery Partner ──── Drives to ────► Restaurant ◄──── Partner with ──── UberEats
```

## Entities

### Delivery Partner

| Attribute    | Description                     | Example values      |
|--------------|---------------------------------|---------------------|
| Rating       | Partner's customer rating       | 4.8 / 5             |
| Commute type | How the partner travels         | Car, Bike           |
| Tips         | Tips the partner has earned     | $12.50              |

### Restaurant

| Attribute    | Description                     | Example values                          |
|--------------|---------------------------------|-----------------------------------------|
| Cuisine type | Kind of food served             | Asian, Thai, Indian, Chinese, …         |
| Store type   | Kind of establishment           | Food Truck, Fine Dining, …              |

### UberEats

| Attribute      | Description                          | Example values             |
|----------------|--------------------------------------|----------------------------|
| Service charge | Fee charged for the delivery service | $3.99                      |
| Route          | Path from restaurant to customer     | Restaurant → Customer      |
| Delivery time  | Estimated time to deliver            | 30 min                     |
| Membership     | Customer's membership tier           | Standard, Uber One         |

## Relationships

| From             | Relationship | To         | Meaning                                              |
|------------------|--------------|------------|------------------------------------------------------|
| Delivery Partner | Drives to    | Restaurant | The partner drives to the restaurant to pick up an order |
| UberEats         | Partner with | Restaurant | UberEats partners with the restaurant to deliver its food |

## Rules

1. **Confidentiality of the customer's details** — each entity only sees the customer information it needs. A delivery partner gets the delivery address, instructions and order number, but not payment details or account history.
2. **Delivery time** — every active order must have an estimated delivery time, and it is updated as the order moves forward.

## Actions

| Action                     | What happens                                                        |
|----------------------------|---------------------------------------------------------------------|
| Receiving payment          | The customer's payment for an order is processed (details kept private) |
| Receiving orders           | The restaurant receives a new order from a customer                 |
| Chatbots / assistance      | Customers can ask about order status, delivery time, etc.           |
| Profile / account creation | Customers create an account (name, email, phone, membership)        |

## Location (Morningside Heights, around Columbia University)

The model is placed on the real street grid from W 108th to W 120th St, between Riverside Dr and Manhattan Ave.
The main object is the **food parcel**, and places are named by **street & avenue junctions**.

| Entity           | Location |
|------------------|----------|
| Indian Kitchen   | Broadway between W 111th & W 112th St (east side) |
| Thai Leaf        | Amsterdam Ave between W 110th & W 111th St (west side) |
| Wok on Wheels    | Food truck on Broadway between W 115th & W 116th St, by the Columbia gates |
| Trattoria Roma   | Amsterdam Ave between W 113th & W 114th St (east side) |
| Priya (C01)      | W 118th St between Amsterdam Ave & Morningside Dr |
| Food parcel      | Wherever its container is: the kitchen → the rider's bag → the customer's door |
| UberEats         | No physical place: it is present as the sticker in each partner's window |

The four location questions the model answers:

1. **Given a referent, what is its location?** "Where is parcel O01?" → *in DP01's bag, on Amsterdam Ave between W 116th & W 117th St*.
2. **Given a location, what is occupying it?** "What is at Broadway & W 112th St?" → *Indian Kitchen, parcel O01, 4 pedestrians*.
3. **Given a frame of reference, where is an occupant?** The same parcel can be described on the street grid, from a landmark ("4½ blocks south of the Columbia Main Gates"), from the customer's door, from the rider's own point of view ("110 m straight ahead") or as latitude/longitude.
4. **Given a description, infer a specific location.** "The Indian place near the cathedral" → *Indian Kitchen, Broadway & W 112th St*.

## Time

Time is the second determining factor. Each restaurant has a **preparation time** and each delivery partner a **speed** for their commute type; routes follow real streets (Columbia's campus, Barnard, the Cathedral and Morningside Park block some of them). So:

```
estimated delivery = cooking time left + rider's time to the restaurant + ride to the customer + hand-off
```

The rider is dispatched so they reach the restaurant just as the food is ready.

## Distance

Distance is measured on the street grid, not as the crow flies. Three delivery jobs are compared:

| Job | Pickup | Delivery | Usual mode |
|-----|--------|----------|------------|
| 1 | P1 Indian Kitchen (Broadway, W 111th–112th) | D1 Priya (W 118th St, Amsterdam–Morningside Dr) | 🛵 Bike |
| 2 | P2 Thai Leaf (Amsterdam, W 110th–111th) | D2 Ana (Riverside Dr & W 111th St) | 🚗 Car |
| 3 | P3 Wok on Wheels (Broadway & W 116th St) | D3 Sam (W 113th St, Broadway–Amsterdam) | 🚲 Bicycle |

For each job the model reports:

- **Streets away**: how many blocks uptown/downtown (e.g. 6½).
- **Avenues away**: how many avenues are crossed (e.g. 1, Amsterdam Ave).
- **Distance**: metres along the route, compared with the straight line (a detour factor).
- **Mode of commute and time**: ride time at that mode's city speed, plus hand-off. Walking can use College Walk through campus; vehicles cannot.

Routes are coloured on a **gradient from long (red) to short (green)**.

**Road closures** remove a street segment from the network (for example Broadway between W 114th & W 115th St for a water-main repair). The route is recomputed around it, and the model reports the **de-route**: the extra metres and minutes compared with the fastest route if the street were open. A rider can still reach a door on a closed block (local access).
