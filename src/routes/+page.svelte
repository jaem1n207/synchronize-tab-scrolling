<script lang="ts">
	let value = '';
	let result = '';

	const printResult = () => {
		result = value;
	};
</script>

<div class="container">
	<h1>HMR Test!</h1>
	<form on:submit|preventDefault={printResult}>
		<input type="text" placeholder="1 + 2" bind:value />
		<button type="submit">Print Result</button>
		<p>{result}</p>
	</form>
</div>
