defmodule CallsafeSignaling.DeviceRegistryTest do
  use ExUnit.Case, async: false

  alias CallsafeSignaling.DeviceRegistry

  setup do
    # Start the DeviceRegistry for each test
    start_supervised!(DeviceRegistry)
    :ok
  end

  describe "register/5" do
    test "registers a new device" do
      device_id = "device_1"
      business_id = "business_1"
      connection_pid = self()

      assert {:ok, entry} =
               DeviceRegistry.register(
                 device_id,
                 business_id,
                 connection_pid,
                 :web,
                 :business,
                 :available
               )

      assert entry.device_id == device_id
      assert entry.business_id == business_id
      assert entry.connection_pid == connection_pid
      assert entry.device_type == :web
      assert entry.status == :available
      assert is_integer(entry.connected_at)
    end

    test "prevents duplicate registration" do
      device_id = "device_1"
      business_id = "business_1"
      connection_pid = self()

      assert {:ok, _entry} =
               DeviceRegistry.register(
                 device_id,
                 business_id,
                 connection_pid,
                 :web,
                 :business,
                 :available
               )

      assert {:error, :already_registered} =
               DeviceRegistry.register(
                 device_id,
                 business_id,
                 connection_pid,
                 :web,
                 :business,
                 :available
               )
    end
  end

  describe "lookup_by_device/1" do
    test "finds registered device" do
      device_id = "device_1"
      business_id = "business_1"
      connection_pid = self()

      {:ok, _} =
        DeviceRegistry.register(
          device_id,
          business_id,
          connection_pid,
          :web,
          :business,
          :available
        )

      assert {:ok, entry} = DeviceRegistry.lookup_by_device(device_id)
      assert entry.device_id == device_id
    end

    test "returns error for non-existent device" do
      assert {:error, :not_found} = DeviceRegistry.lookup_by_device("nonexistent")
    end
  end

  describe "list_by_business/1" do
    test "lists all devices for a business" do
      business_id = "business_1"
      pid = self()

      {:ok, _} =
        DeviceRegistry.register("device_1", business_id, pid, :web, :business, :available)

      {:ok, _} =
        DeviceRegistry.register("device_2", business_id, pid, :mobile, :business, :available)

      {:ok, _} =
        DeviceRegistry.register("device_3", "business_2", pid, :web, :business, :available)

      devices = DeviceRegistry.list_by_business(business_id)
      assert length(devices) == 2
      assert Enum.all?(devices, fn d -> d.business_id == business_id end)
    end

    test "returns empty list for business with no devices" do
      assert [] = DeviceRegistry.list_by_business("nonexistent")
    end
  end

  describe "update_status/2" do
    test "updates device status" do
      device_id = "device_1"
      business_id = "business_1"
      connection_pid = self()

      {:ok, _} =
        DeviceRegistry.register(
          device_id,
          business_id,
          connection_pid,
          :web,
          :business,
          :available
        )

      assert {:ok, entry} = DeviceRegistry.update_status(device_id, :unavailable)
      assert entry.status == :unavailable
    end

    test "returns error for non-existent device" do
      assert {:error, :not_found} = DeviceRegistry.update_status("nonexistent", :unavailable)
    end
  end

  describe "unregister/1" do
    test "removes device from registry" do
      device_id = "device_1"
      business_id = "business_1"
      connection_pid = self()

      {:ok, _} =
        DeviceRegistry.register(
          device_id,
          business_id,
          connection_pid,
          :web,
          :business,
          :available
        )

      assert :ok = DeviceRegistry.unregister(device_id)
      assert {:error, :not_found} = DeviceRegistry.lookup_by_device(device_id)
    end

    test "handles unregister of non-existent device gracefully" do
      assert :ok = DeviceRegistry.unregister("nonexistent")
    end
  end

  describe "count/0 and count_by_business/1" do
    test "counts registered devices" do
      pid = self()

      assert DeviceRegistry.count() == 0

      {:ok, _} =
        DeviceRegistry.register("device_1", "business_1", pid, :web, :business, :available)

      {:ok, _} =
        DeviceRegistry.register("device_2", "business_1", pid, :mobile, :business, :available)

      {:ok, _} =
        DeviceRegistry.register("device_3", "business_2", pid, :web, :business, :available)

      assert DeviceRegistry.count() == 3
      assert DeviceRegistry.count_by_business("business_1") == 2
      assert DeviceRegistry.count_by_business("business_2") == 1
    end
  end

  describe "process monitoring" do
    test "automatically unregisters device when connection process dies" do
      device_id = "device_1"
      business_id = "business_1"

      # Spawn a process to act as connection
      connection_pid = spawn(fn -> Process.sleep(:infinity) end)

      {:ok, _} =
        DeviceRegistry.register(
          device_id,
          business_id,
          connection_pid,
          :web,
          :business,
          :available
        )

      assert {:ok, _entry} = DeviceRegistry.lookup_by_device(device_id)

      # Kill the connection process
      Process.exit(connection_pid, :kill)

      # Give time for DOWN message to be processed
      Process.sleep(100)

      # Device should be auto-unregistered
      assert {:error, :not_found} = DeviceRegistry.lookup_by_device(device_id)
    end
  end
end
