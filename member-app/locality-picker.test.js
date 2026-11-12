import test from "node:test";
import assert from "node:assert/strict";
import { cleanCitySearch, cityShard, cityLabel } from "./locality-picker.js";

test("search normalization agrees with the GeoNames index builder", () => {
  assert.equal(cleanCitySearch("São Paulo"), "saopaulo");
  assert.equal(cityShard("São Paulo"), "sa");
  assert.equal(cityShard("Savannah, Georgia"), "sa");
  assert.equal(cityShard("St. Louis"), "st");
});
test("city labels disambiguate common names without street addresses", () => {
  assert.equal(cityLabel({n:"Savannah",a:"Georgia",c:"US"}), "Savannah, Georgia, United States");
  assert.equal(cityLabel({n:"Paris",a:"Ile-de-France",c:"FR"}), "Paris, Ile-de-France, France");
});
